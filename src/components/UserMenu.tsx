import { useState, useEffect, useRef } from 'react';
import './UserMenu.css';

interface UserInfo {
  id: number;
  name: string;
  email: string;
}

// SVG Icons
const HomeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);

const UserIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="8" cy="5" r="3" fill="currentColor" />
    <path d="M2 14c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" strokeWidth="1.5" fill="none" />
  </svg>
);

const ProjectsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7"/>
    <rect x="14" y="3" width="7" height="7"/>
    <rect x="14" y="14" width="7" height="7"/>
    <rect x="3" y="14" width="7" height="7"/>
  </svg>
);

const LogoutIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path 
      d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3M11 12l4-4-4-4M15 8H6" 
      stroke="currentColor"
      strokeWidth="1.5" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      fill="none" 
    />
  </svg>
);

interface UserMenuProps {
  currentPage?: 'home' | 'projects';
  onNavigate?: (page: 'home' | 'projects') => void;
}

export function UserMenu({ currentPage = 'home', onNavigate }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [showUserInfo, setShowUserInfo] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Get user info from localStorage or window
  useEffect(() => {
    // Try to get from window (set by index.html auth check)
    if (window.__AUTH_USER__) {
      setUser(window.__AUTH_USER__ as UserInfo);
    } else {
      // Fall back to localStorage
      const storedUser = localStorage.getItem('authUser');
      if (storedUser) {
        try {
          setUser(JSON.parse(storedUser));
        } catch (e) {
          console.error('Failed to parse stored user:', e);
        }
      }
    }
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowUserInfo(false);
      }
    }

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem('authToken');
      // Call logout endpoint (optional, mainly for session cleanup)
      await fetch('api/logout', {
        method: 'POST',
        headers: token ? { 'Authorization': 'Bearer ' + token } : {}
      });
    } catch (error) {
      console.error('Logout API call failed:', error);
    }
    
    // Clear local storage
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
    
    // Preserve Forma's query parameters when redirecting to login
    const queryString = window.location.search;
    window.location.href = '/login.html' + queryString;
  };

  const handleNavigation = (page: 'home' | 'projects') => {
    setIsOpen(false);
    setShowUserInfo(false);
    if (onNavigate) {
      onNavigate(page);
    }
  };

  return (
    <div className="user-menu" ref={menuRef}>
      <img 
        className="logo-icon" 
        src="logo-HENN.png" 
        alt="Menu" 
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
          setShowUserInfo(false);
        }}
      />
      
      {isOpen && (
        <div className="dropdown-menu show">
          {/* Home Button */}
          <button 
            onClick={() => handleNavigation('home')} 
            className={`menu-item ${currentPage === 'home' ? 'active' : ''}`}
          >
            <HomeIcon />
            Home
          </button>
          
          {/* User Information Button */}
          <button 
            onClick={() => setShowUserInfo(!showUserInfo)} 
            className={`menu-item ${showUserInfo ? 'active' : ''}`}
          >
            <UserIcon />
            User Information
          </button>
          
          {/* User Info Panel (expandable) */}
          {showUserInfo && user && (
            <div className="user-info-panel">
              <div className="user-info-row">
                <span className="info-label">Name:</span>
                <span className="info-value">{user.name}</span>
              </div>
              <div className="user-info-row">
                <span className="info-label">Email:</span>
                <span className="info-value">{user.email}</span>
              </div>
            </div>
          )}
          
          {/* Projects Button */}
          <button 
            onClick={() => handleNavigation('projects')} 
            className={`menu-item ${currentPage === 'projects' ? 'active' : ''}`}
          >
            <ProjectsIcon />
            Projects
          </button>
          
          {/* Divider */}
          <div className="menu-divider"></div>
          
          {/* Logout Button */}
          <button onClick={handleLogout} className="menu-item logout-item">
            <LogoutIcon />
            Log Out
          </button>
        </div>
      )}
    </div>
  );
}

// Extend Window interface for TypeScript
declare global {
  interface Window {
    __AUTH_USER__?: UserInfo;
    __AUTH_TOKEN__?: string;
  }
}
