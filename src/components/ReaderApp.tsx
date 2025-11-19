'use client';

import React, { useEffect, useState } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import ArticleList from '@/components/ArticleList';

type Feed = {
  id: number;
  url: string;
  title?: string | null;
  createdAt: number;
};

type Article = {
  id: string;
  title: string;
  link: string;
  summary?: string | null;
  pubDate?: string | null;
  source?: string | null;
  feedUrl?: string | null;
  createdAt: number;
};

export default function ReaderApp() {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [selectedFeedUrl, setSelectedFeedUrl] = useState<string | 'all'>('all');
  const [loading, setLoading] = useState(true);

  async function loadFeeds() {
    const res = await fetch('/api/feeds');
    if (!res.ok) {
      console.error('Failed to load feeds', res.statusText);
      return;
    }
    const data = await res.json();
    setFeeds(Array.isArray(data.feeds) ? data.feeds : []);
  }

  async function loadArticles(feedUrl: string | 'all' = selectedFeedUrl) {
    const params = new URLSearchParams();
    params.set('limit', '100');
    if (feedUrl !== 'all') {
      params.set('feedUrl', feedUrl);
    }

    const res = await fetch(`/api/articles?${params.toString()}`);
    if (!res.ok) {
      console.error('Failed to load articles', res.statusText);
      return;
    }
    const data = await res.json();
    setArticles(Array.isArray(data.items) ? data.items : []);
  }

  useEffect(() => {
    (async () => {
      await loadFeeds();
      await loadArticles('all');
      setLoading(false);
    })().catch((err) => {
      console.error('Failed to initialize reader', err);
      setLoading(false);
    });
  }, []);

  const handleSelectFeed = (feedUrl: string | 'all') => {
    setSelectedFeedUrl(feedUrl);
    loadArticles(feedUrl).catch((err) => console.error('Failed to load articles', err));
  };

  const handleAddFeed = async (url: string) => {
    const res = await fetch('/api/feeds', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
    });

    if (!res.ok) {
      console.error('Failed to add feed', await res.text());
      return;
    }

    await loadFeeds();
    // After adding, refresh articles so the new feed starts being visible when collector runs.
    await loadArticles(selectedFeedUrl);
  };

  return (
    <>
      <Header />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar
          feeds={feeds}
          selectedFeedUrl={selectedFeedUrl}
          onSelectFeed={handleSelectFeed}
          onAddFeed={handleAddFeed}
        />
        <ArticleList articles={articles} loading={loading} />
      </div>
    </>
  );
}

