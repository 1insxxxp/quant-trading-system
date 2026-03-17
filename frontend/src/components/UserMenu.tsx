import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export const UserMenu: React.FC = () => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (!user) {
    return null;
  }

  return (
    <div className="user-menu">
      <button
        className="user-menu-button"
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        type="button"
        aria-label={`用户菜单 - ${user.username}`}
        aria-expanded={isDropdownOpen}
      >
        <div className="user-menu-avatar">
          {user.username.charAt(0).toUpperCase()}
        </div>
        <span>{user.username}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          className={`user-menu-chevron ${isDropdownOpen ? 'user-menu-chevron--open' : ''}`}
        >
          <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {isDropdownOpen && (
        <>
          <div
            className="user-menu-backdrop"
            onClick={() => setIsDropdownOpen(false)}
          />
          <div className="user-menu-dropdown">
            <div className="user-menu-dropdown-header">
              <div className="user-menu-dropdown-header-title">账户</div>
              <div className="user-menu-dropdown-header-username">{user.username}</div>
            </div>
            <button
              className="user-menu-dropdown-item user-menu-dropdown-item--danger"
              onClick={handleLogout}
              type="button"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 12L14 8M14 8L10 4M14 8H3M6 2H13C13.5523 2 14 2.44772 14 3V5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M6 14H13C13.5523 14 14 13.5523 14 13V11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              退出登录
            </button>
          </div>
        </>
      )}
    </div>
  );
};
