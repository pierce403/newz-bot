import React from 'react';

const articles = [
    {
        id: 1,
        source: 'ICEF Monitor - Market intell',
        title: 'Demand for Spanish instruction escalating, higher ed still facing challenges',
        snippet: 'Spain has long been a destination for students...',
        time: '8:22 AM'
    },
    {
        id: 2,
        source: 'collegewebeditor.com',
        title: '1-1-1 Book Review: Lean In: Women, Work, and the Will to Lead by Sheryl Sandberg',
        snippet: 'I read my fair share of books...',
        time: '7:31 AM'
    },
    {
        id: 3,
        source: 'Online Marketing Blog',
        title: 'Online Marketing News: Google Updates, Email Marketing Insights & Content Marketing Success',
        snippet: '7 tips for better email marketing...',
        time: '7:17 AM'
    },
    {
        id: 4,
        source: 'HESA',
        title: 'No to "World-Class" Research in the Humanities',
        snippet: 'You often hear talk about how Canadian institutions need to...',
        time: '7:01 AM'
    },
    {
        id: 5,
        source: 'Posts',
        title: 'Could Google Hangouts on Air be the solution to your college\'s video headaches?',
        snippet: 'Videos are some of the most engaging content...',
        time: '1:50 AM'
    },
    // Add more dummy items to fill the list
    ...Array.from({ length: 15 }).map((_, i) => ({
        id: 6 + i,
        source: 'TechCrunch',
        title: `Random Tech News Article #${i + 1} about AI and stuff`,
        snippet: 'This is a snippet of the article that goes on for a bit...',
        time: 'Apr 4, 2013'
    }))
];

export default function ArticleList() {
    return (
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)', overflow: 'hidden' }}>
            {/* Toolbar */}
            <div style={{
                padding: '10px 15px',
                borderBottom: '1px solid #ebebeb',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                backgroundColor: 'white'
            }}>
                <button style={{ padding: '4px 8px', border: '1px solid #dcdcdc', borderRadius: '2px', background: '#f5f5f5', fontWeight: 'bold', cursor: 'pointer' }}>↻</button>
                <button style={{ padding: '4px 8px', border: '1px solid #dcdcdc', borderRadius: '2px', background: '#f5f5f5', fontWeight: 'bold', cursor: 'pointer' }}>30 new items ▼</button>
                <button style={{ padding: '4px 8px', border: '1px solid #dcdcdc', borderRadius: '2px', background: '#f5f5f5', fontWeight: 'bold', cursor: 'pointer' }}>Mark all as read ▼</button>
                <button style={{ padding: '4px 8px', border: '1px solid #dcdcdc', borderRadius: '2px', background: '#f5f5f5', fontWeight: 'bold', cursor: 'pointer' }}>Folder settings... ▼</button>

                <div style={{ flex: 1 }}></div>

                <div style={{ display: 'flex', gap: '0' }}>
                    <button style={{ padding: '4px 8px', border: '1px solid #dcdcdc', borderRadius: '2px 0 0 2px', background: '#f5f5f5', cursor: 'pointer' }}>≡</button>
                    <button style={{ padding: '4px 8px', border: '1px solid #dcdcdc', borderLeft: 'none', borderRadius: '0 2px 2px 0', background: '#fff', cursor: 'pointer' }}>☰</button>
                </div>

                <div style={{ display: 'flex', gap: '0' }}>
                    <button style={{ padding: '4px 8px', border: '1px solid #dcdcdc', borderRadius: '2px 0 0 2px', background: '#f5f5f5', cursor: 'pointer' }}>^</button>
                    <button style={{ padding: '4px 8px', border: '1px solid #dcdcdc', borderLeft: 'none', borderRadius: '0 2px 2px 0', background: '#f5f5f5', cursor: 'pointer' }}>v</button>
                </div>

                <button style={{ padding: '4px 8px', border: '1px solid #dcdcdc', borderRadius: '2px', background: '#f5f5f5', cursor: 'pointer' }}>⚙ ▼</button>
            </div>

            {/* List Header */}
            <div style={{ padding: '15px', borderBottom: '1px solid #ebebeb' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 'bold' }}>Marketing Ed Tech Blogs</h2>
            </div>

            {/* List */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
                {articles.map((article) => (
                    <div key={article.id} style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '8px 15px',
                        borderBottom: '1px solid #f0f0f0',
                        cursor: 'pointer',
                        fontSize: '13px',
                        backgroundColor: 'white'
                    }}>
                        <span style={{ color: '#ccc', marginRight: '10px', fontSize: '16px' }}>☆</span>
                        <span style={{ width: '200px', color: '#888', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', marginRight: '15px' }}>{article.source}</span>
                        <span style={{ fontWeight: 'bold', color: '#000', marginRight: '5px', whiteSpace: 'nowrap' }}>{article.title}</span>
                        <span style={{ color: '#888', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', flex: 1 }}> - {article.snippet}</span>
                        <span style={{ color: '#888', marginLeft: '15px', whiteSpace: 'nowrap', width: '80px', textAlign: 'right' }}>{article.time}</span>
                    </div>
                ))}
            </div>
        </main>
    );
}
