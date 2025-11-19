'use client';

import React from 'react';

type Article = {
  id: string;
  title: string;
  link: string;
  summary?: string | null;
  pubDate?: string | null;
  source?: string | null;
  createdAt: number;
};

type Props = {
  articles: Article[];
  loading: boolean;
};

export default function ArticleList({ articles, loading }: Props) {
  return (
    <main
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 60px)',
        overflow: 'hidden',
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          padding: '10px 15px',
          borderBottom: '1px solid #ebebeb',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          backgroundColor: 'white',
        }}
      >
        <button
          type="button"
          style={{
            padding: '4px 8px',
            border: '1px solid #dcdcdc',
            borderRadius: '2px',
            background: '#f5f5f5',
            fontWeight: 'bold',
            cursor: 'pointer',
          }}
        >
          ↻
        </button>
        <span
          style={{
            fontSize: '13px',
            color: '#666',
          }}
        >
          {articles.length > 0 ? `${articles.length} items` : 'No items'}
        </span>

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', gap: '0' }}>
          <button
            type="button"
            style={{
              padding: '4px 8px',
              border: '1px solid #dcdcdc',
              borderRadius: '2px 0 0 2px',
              background: '#f5f5f5',
              cursor: 'default',
            }}
          >
            ≡
          </button>
          <button
            type="button"
            style={{
              padding: '4px 8px',
              border: '1px solid #dcdcdc',
              borderLeft: 'none',
              borderRadius: '0 2px 2px 0',
              background: '#fff',
              cursor: 'default',
            }}
          >
            ☰
          </button>
        </div>
      </div>

      {/* List Header */}
      <div
        style={{
          padding: '15px',
          borderBottom: '1px solid #ebebeb',
        }}
      >
        <h2
          style={{
            fontSize: '18px',
            fontWeight: 'bold',
          }}
        >
          All items
        </h2>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && (
          <div
            style={{
              padding: '20px 15px',
              color: '#666',
              fontSize: '13px',
            }}
          >
            Loading…
          </div>
        )}
        {!loading && articles.length === 0 && (
          <div
            style={{
              padding: '20px 15px',
              color: '#666',
              fontSize: '13px',
            }}
          >
            No items yet. Add some subscriptions and run the collector.
          </div>
        )}
        {articles.map((article) => (
          <a
            key={article.id}
            href={article.link}
            target="_blank"
            rel="noreferrer"
            style={{
              textDecoration: 'none',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 15px',
                borderBottom: '1px solid #f0f0f0',
                cursor: 'pointer',
                fontSize: '13px',
                backgroundColor: 'white',
              }}
            >
              <span
                style={{
                  color: '#ccc',
                  marginRight: '10px',
                  fontSize: '16px',
                }}
              >
                ☆
              </span>
              <span
                style={{
                  width: '200px',
                  color: '#888',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                  marginRight: '15px',
                }}
              >
                {article.source || new URL(article.link).hostname}
              </span>
              <span
                style={{
                  fontWeight: 'bold',
                  color: '#000',
                  marginRight: '5px',
                  whiteSpace: 'nowrap',
                }}
              >
                {article.title}
              </span>
              <span
                style={{
                  color: '#888',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                  flex: 1,
                }}
              >
                {' '}
                - {article.summary || ''}
              </span>
              <span
                style={{
                  color: '#888',
                  marginLeft: '15px',
                  whiteSpace: 'nowrap',
                  width: '120px',
                  textAlign: 'right',
                }}
              >
                {article.pubDate ||
                  new Date(article.createdAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })}
              </span>
            </div>
          </a>
        ))}
      </div>
    </main>
  );
}
