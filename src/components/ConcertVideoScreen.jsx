import { useCallback, useEffect, useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import {
  getServerClockOffsetMs,
  getSynchronizedPlaybackSeconds,
} from '../game/concert-video-sync.js';
import { isConcertScreenInView } from '../game/concert-screen-visibility.js';

let youtubeApiPromise;

function loadYouTubeIframeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise((resolve, reject) => {
    let pollTimer;
    const timeout = window.setTimeout(() => {
      window.clearInterval(pollTimer);
      reject(new Error('Timed out waiting for the YouTube iframe API.'));
    }, 20_000);
    const finish = (error) => {
      window.clearTimeout(timeout);
      window.clearInterval(pollTimer);
      if (error) reject(error);
      else resolve(window.YT);
    };
    const script = document.querySelector('script[src="https://www.youtube.com/iframe_api"]')
      || document.createElement('script');

    script.addEventListener('error', () => finish(new Error('Could not load the YouTube iframe API.')), { once: true });
    if (!script.src) {
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      document.head.appendChild(script);
    }

    pollTimer = window.setInterval(() => {
      if (window.YT?.Player) finish();
    }, 100);
  }).catch((error) => {
    youtubeApiPromise = undefined;
    throw error;
  });

  return youtubeApiPromise;
}

async function synchronizeServerClock() {
  const requestStartedAt = Date.now();
  let response = await fetch(window.location.href, { method: 'HEAD', cache: 'no-store' });
  if (response.status === 405 || response.status === 501) {
    response = await fetch(window.location.href, { method: 'GET', cache: 'no-store' });
  }
  const responseReceivedAt = Date.now();
  if (!response.ok) throw new Error(`Server clock request failed with HTTP ${response.status}.`);
  return getServerClockOffsetMs(
    response.headers.get('Date'),
    requestStartedAt,
    responseReceivedAt,
  );
}

export default function ConcertVideoScreen({ screen, audioControlRef, onAudioStatusChange }) {
  const screenObjectRef = useRef(null);
  const playerContainerRef = useRef(null);
  const playerRef = useRef(null);
  const clockOffsetRef = useRef(0);
  const screenInViewRef = useRef(true);
  const screenVisibleRef = useRef(true);
  const occludedRef = useRef(false);
  const isMutedRef = useRef(true);
  const lastVisibilityCheckRef = useRef(0);
  const [playerError, setPlayerError] = useState('');
  const [playerReady, setPlayerReady] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isScreenVisible, setIsScreenVisible] = useState(true);
  const widthPx = screen.width * 40;
  const heightPx = screen.height * 40;
  const width = screen.width;
  const height = screen.height;

  useFrame(({ camera, clock }) => {
    if (clock.elapsedTime - lastVisibilityCheckRef.current < 0.2) return;
    lastVisibilityCheckRef.current = clock.elapsedTime;
    const inView = screenObjectRef.current
      ? isConcertScreenInView(camera, screenObjectRef.current, width, height)
      : false;
    screenInViewRef.current = inView;
    const visible = inView && !occludedRef.current;
    screenVisibleRef.current = visible;
    if (visible !== isScreenVisible) setIsScreenVisible(visible);
  });

  const handleOcclusionChange = useCallback((occluded) => {
    occludedRef.current = occluded;
    const visible = screenInViewRef.current && !occluded;
    screenVisibleRef.current = visible;
    setIsScreenVisible((current) => (current === visible ? current : visible));
  }, []);

  useEffect(() => {
    let disposed = false;
    let clockSyncTimer;
    let playerSyncTimer;

    const syncClock = async () => {
      try {
        clockOffsetRef.current = await synchronizeServerClock();
      } catch (error) {
        console.warn('Concert video is using the local clock because server time could not be synchronized.', error);
      }
    };

    const playbackTime = () => getSynchronizedPlaybackSeconds(
      Date.now() + clockOffsetRef.current,
      screen.durationSeconds,
    );

    const initializePlayer = async () => {
      await syncClock();
      const youtube = await loadYouTubeIframeApi();
      if (disposed || !playerContainerRef.current) return;

      const startSeconds = playbackTime();
      const player = new youtube.Player(playerContainerRef.current, {
        videoId: screen.videoId,
        width: String(widthPx),
        height: String(heightPx),
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          loop: 1,
          modestbranding: 1,
          origin: window.location.origin,
          playsinline: 1,
          playlist: screen.videoId,
          rel: 0,
          start: startSeconds,
          mute: 1,
        },
        events: {
          onReady: ({ target }) => {
            if (disposed) return;
            setPlayerReady(true);
            setIsMuted(true);
            isMutedRef.current = true;
            target.mute();
            target.seekTo(playbackTime(), true);
            if (screenVisibleRef.current) target.playVideo();
            else target.pauseVideo();
            playerSyncTimer = window.setInterval(() => {
              if (!screenVisibleRef.current && isMutedRef.current) return;
              const state = target.getPlayerState();
              if (state === youtube.PlayerState.PLAYING) {
                if (Math.abs(target.getCurrentTime() - playbackTime()) > 1.5) {
                  target.seekTo(playbackTime(), true);
                }
              } else if (state === youtube.PlayerState.ENDED || state === youtube.PlayerState.PAUSED) {
                target.seekTo(playbackTime(), true);
                target.playVideo();
              }
            }, 5_000);
          },
          onAutoplayBlocked: () => {
            if (disposed) return;
            setIsMuted(true);
            isMutedRef.current = true;
            const currentPlayer = playerRef.current;
            currentPlayer?.mute();
            if (screenVisibleRef.current) currentPlayer?.playVideo();
            else currentPlayer?.pauseVideo();
          },
          onError: ({ data }) => {
            const message = `YouTube could not play the concert video (error ${data}).`;
            console.error(message);
            setPlayerError(message);
          },
        },
      });
      playerRef.current = player;
      clockSyncTimer = window.setInterval(syncClock, 60_000);
    };

    initializePlayer().catch((error) => {
      if (disposed) return;
      const message = `Concert video setup failed: ${error.message}`;
      console.error(message, error);
      setPlayerError(message);
    });

    return () => {
      disposed = true;
      window.clearInterval(clockSyncTimer);
      window.clearInterval(playerSyncTimer);
      setPlayerReady(false);
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [screen.durationSeconds, screen.videoId, heightPx, widthPx]);

  useEffect(() => {
    if (!playerReady || !playerRef.current) return;
    if (isScreenVisible) {
      playerRef.current.seekTo(
        getSynchronizedPlaybackSeconds(
          Date.now() + clockOffsetRef.current,
          screen.durationSeconds,
        ),
        true,
      );
      playerRef.current.playVideo();
    } else if (isMutedRef.current) {
      playerRef.current.pauseVideo();
    }
  }, [isScreenVisible, playerReady, screen.durationSeconds]);

  const toggleMute = useCallback(() => {
    const player = playerRef.current;
    if (!player || !playerReady) return;

    if (isMuted) {
      isMutedRef.current = false;
      player.unMute();
      player.setVolume(100);
      player.playVideo();
      setIsMuted(false);
    } else {
      isMutedRef.current = true;
      player.mute();
      setIsMuted(true);
    }
  }, [isMuted, playerReady]);

  useEffect(() => {
    if (!audioControlRef) return undefined;
    audioControlRef.current = { toggleMute };
    return () => {
      if (audioControlRef.current?.toggleMute === toggleMute) audioControlRef.current = null;
    };
  }, [audioControlRef, toggleMute]);

  useEffect(() => {
    onAudioStatusChange?.({ isMuted, ready: playerReady && !playerError });
  }, [isMuted, onAudioStatusChange, playerError, playerReady]);

  return (
    <group ref={screenObjectRef} position={[screen.x, screen.y, screen.z]}>
      <Html
        transform
        distanceFactor={10}
        occlude
        onOcclude={handleOcclusionChange}
        pointerEvents="none"
        style={{
          width: `${widthPx}px`,
          height: `${heightPx}px`,
          background: '#050505',
          visibility: isScreenVisible ? 'visible' : 'hidden',
        }}
      >
        <div style={{ width: '100%', height: '100%', position: 'relative', background: '#050505' }}>
          <div ref={playerContainerRef} style={{ width: '100%', height: '100%' }} />
          {playerError && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'grid',
                placeItems: 'center',
                padding: '4%',
                background: '#050505',
                color: '#ffffff',
                font: '16px sans-serif',
                textAlign: 'center',
              }}
            >
              Video unavailable
            </div>
          )}
        </div>
      </Html>
    </group>
  );
}
