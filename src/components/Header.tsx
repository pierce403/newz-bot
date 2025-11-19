import React from 'react';

export default function Header() {
    return (
        <header style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 20px',
            backgroundColor: '#f2f2f2',
            borderBottom: '1px solid #e0e0e0',
            height: '60px'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <h1 style={{ fontSize: '20px', color: '#d14836', fontWeight: 'bold' }}>Newz Bot</h1>
                <div style={{ position: 'relative' }}>
                    <input
                        type="text"
                        placeholder="Search Newz Bot"
                        style={{
                            padding: '8px 10px',
                            borderRadius: '2px',
                            border: '1px solid #d9d9d9',
                            width: '300px',
                            fontSize: '14px'
                        }}
                    />
                    <button style={{
                        position: 'absolute',
                        right: '0',
                        top: '0',
                        bottom: '0',
                        backgroundColor: '#4d90fe',
                        border: 'none',
                        color: 'white',
                        padding: '0 15px',
                        borderRadius: '0 2px 2px 0',
                        cursor: 'pointer'
                    }}>
                        Search
                    </button>
                </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', fontSize: '14px', color: '#666' }}>
                <span>user@example.com</span>
                <div style={{ background: '#d14836', color: 'white', padding: '2px 6px', borderRadius: '2px', fontSize: '12px' }}>2</div>
                <button style={{ padding: '5px 10px', background: '#f8f8f8', border: '1px solid #c6c6c6', borderRadius: '2px', cursor: 'pointer' }}>+ Share</button>
            </div>
        </header>
    );
}
