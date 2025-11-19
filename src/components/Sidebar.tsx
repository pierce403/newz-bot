'use client';

import React, { FormEvent, useState } from 'react';

type Feed = {
  id: number;
  url: string;
  title?: string | null;
  createdAt: number;
};

type Props = {
  feeds: Feed[];
  selectedFeedUrl: string | 'all';
  onSelectFeed: (feedUrl: string | 'all') => void;
  onAddFeed: (url: string) => void;
};

export default function Sidebar({ feeds, selectedFeedUrl, onSelectFeed, onAddFeed }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState('');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    onAddFeed(trimmed);
    setUrl('');
    setShowForm(false);
  };

  return (
    <aside
      style={{
        width: '260px',
        backgroundColor: '#f2f2f2',
        borderRight: '1px solid #ebebeb',
        display: 'flex',
        flexDirection: 'column',
        padding: '15px 0',
        overflowY: 'auto',
        height: 'calc(100vh - 60px)',
      }}
    >
      <div style={{ padding: '0 15px 15px 15px' }}>
        <button
          type="button"
          onClick={() => setShowForm((prev) => !prev)}
          style={{
            backgroundColor: '#d14836',
            color: 'white',
            border: '1px solid transparent',
            padding: '8px 15px',
            fontWeight: 'bold',
            borderRadius: '2px',
            cursor: 'pointer',
            fontSize: '13px',
            textTransform: 'uppercase',
          }}
        >
          Subscribe
        </button>
        {showForm && (
          <form onSubmit={handleSubmit} style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste feed URL…"
              style={{
                padding: '6px 8px',
                borderRadius: '2px',
                border: '1px solid #dcdcdc',
                fontSize: '13px',
              }}
            />
            <button
              type="submit"
              style={{
                alignSelf: 'flex-start',
                backgroundColor: '#4d90fe',
                color: 'white',
                border: '1px solid #3079ed',
                padding: '4px 10px',
                fontWeight: 'bold',
                borderRadius: '2px',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              Add subscription
            </button>
          </form>
        )}
      </div>

      <nav>
        <ul style={{ listStyle: 'none' }}>
          <li
            style={{
              padding: '6px 15px',
              cursor: 'pointer',
              color: '#333',
              fontWeight: 'bold',
            }}
          >
            Home
          </li>
          <li
            onClick={() => onSelectFeed('all')}
            style={{
              padding: '6px 15px',
              cursor: 'pointer',
              color: '#333',
              fontWeight: 'bold',
              backgroundColor: selectedFeedUrl === 'all' ? 'white' : 'transparent',
              borderLeft: selectedFeedUrl === 'all' ? '4px solid #d14836' : '4px solid transparent',
            }}
          >
            All items
          </li>
          <li style={{ padding: '6px 15px', cursor: 'default', color: '#999' }}>Starred items</li>
          <li style={{ padding: '6px 15px', cursor: 'default', color: '#999' }}>Trends</li>
          <li style={{ padding: '6px 15px', cursor: 'default', color: '#999' }}>Browse for stuff</li>
        </ul>

        <div style={{ marginTop: '20px' }}>
          <div
            style={{
              padding: '5px 15px',
              fontWeight: 'bold',
              color: '#333',
              cursor: 'default',
            }}
          >
            ▼ Subscriptions
          </div>
          <ul style={{ listStyle: 'none', marginTop: '5px' }}>
            {feeds.map((feed) => {
              const isActive = selectedFeedUrl === feed.url;
              const label = feed.title || feed.url;
              return (
                <li
                  key={feed.id}
                  onClick={() => onSelectFeed(feed.url)}
                  style={{
                    padding: '4px 15px 4px 35px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    backgroundColor: isActive ? '#dd4b39' : 'transparent',
                    color: isActive ? 'white' : '#333',
                  }}
                >
                  <span
                    style={{
                      width: '10px',
                      height: '10px',
                      backgroundColor: '#666',
                      marginRight: '8px',
                      display: 'inline-block',
                    }}
                  />
                  <span
                    style={{
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis',
                    }}
                    title={label}
                  >
                    {label}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>
    </aside>
  );
}
