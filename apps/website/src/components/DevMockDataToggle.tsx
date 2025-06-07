import { useState, useEffect } from 'react';
import { devControls } from '../lib/api.js';

export function DevMockDataToggle() {
  const [useMockData, setUseMockData] = useState(true);

  useEffect(() => {
    if (devControls) {
      setUseMockData(devControls.useMockData());
    }

    // Listen for mock data changes from other sources (like console commands)
    const handleMockDataChange = (event: CustomEvent) => {
      setUseMockData(event.detail.enabled);
    };

    window.addEventListener(
      'mock-data-changed',
      handleMockDataChange as EventListener,
    );

    return () => {
      window.removeEventListener(
        'mock-data-changed',
        handleMockDataChange as EventListener,
      );
    };
  }, []);

  const handleToggle = () => {
    if (devControls) {
      const newValue = devControls.toggleMockData();
      setUseMockData(newValue);

      // Show a brief notification
      showNotification(
        `Switched to ${newValue ? 'Mock' : 'Real'} API mode. Refresh to see changes.`,
      );
    }
  };

  function showNotification(message: string) {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: var(--bg-accent);
      color: var(--text-inverse);
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 14px;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      animation: slideIn 0.3s ease-out;
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease-in forwards';
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }

  return (
    <div className="dev-toggle-container">
      <div className="dev-toggle-content">
        <span className="dev-toggle-label">DEV</span>
        <label className="dev-toggle-switch">
          <input
            type="checkbox"
            checked={useMockData}
            onChange={handleToggle}
            className="dev-toggle-input"
          />
          <span className="dev-toggle-slider" />
        </label>
        <span className="dev-toggle-text">
          {useMockData ? 'Mock Data' : 'Real API'}
        </span>
      </div>
    </div>
  );
}
