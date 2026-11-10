import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import './concert.css';

export const CONCERT_TOUR_STORAGE_KEY = 'office.concertTourSeen';

export function startConcertTour() {
  const concertTour = driver({
    showProgress: true,
    allowClose: true,
    nextBtnText: 'Tiếp',
    prevBtnText: 'Quay lại',
    doneBtnText: 'Bắt đầu khám phá',
    closeBtnLabel: 'Đóng hướng dẫn',
    popoverClass: 'concert-tour',
    steps: [
      {
        element: '.concert-controls__views',
        popover: {
          title: 'Chọn góc nhìn',
          description: 'Đổi giữa góc nhìn mặc định, góc nhìn thứ 3 và góc nhìn thứ 1 để quan sát concert theo cách bạn thích.',
        },
      },
      {
        element: '.concert-controls__daynight',
        popover: {
          title: 'Đổi ngày và đêm',
          description: 'Nhấn nút này để chuyển không gian concert giữa ban ngày và ban đêm.',
        },
      },
      {
        element: '.concert-controls__audio',
        popover: {
          title: 'Âm thanh sân khấu',
          description: 'Bật hoặc tắt nhạc sân khấu tại đây. Nút sẽ sẵn sàng khi âm thanh được tải.',
        },
      },
      {
        element: '.concert-teleport > button',
        popover: {
          title: 'Dịch chuyển đến khu vực',
          description: 'Mở danh sách khu vực, xem giá vé và khoảng cách, rồi chọn nơi bạn muốn đến.',
        },
      },
      {
        element: '.movement-joystick',
        popover: {
          title: 'Di chuyển trong concert',
          description: 'Dùng cần điều khiển ở góc dưới trái hoặc phím WASD trên máy tính để di chuyển.',
          side: 'right',
        },
      },
    ],
  });

  concertTour.drive();
  return concertTour;
}
