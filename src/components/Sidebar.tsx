import React from 'react';

export default function Sidebar() {
    return (
        <aside style={{
            width: '260px',
            backgroundColor: '#f2f2f2', // Slightly darker than main content
            borderRight: '1px solid #ebebeb',
            display: 'flex',
            flexDirection: 'column',
            padding: '15px 0',
            overflowY: 'auto',
            height: 'calc(100vh - 60px)'
        }}>
            <div style={{ padding: '0 15px 15px 15px' }}>
                <button style={{
                    backgroundColor: '#d14836',
                    color: 'white',
                    border: '1px solid transparent',
                    padding: '8px 15px',
                    fontWeight: 'bold',
                    borderRadius: '2px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    textTransform: 'uppercase'
                }}>
                    Subscribe
                </button>
            </div>

            <nav>
                <ul style={{ listStyle: 'none' }}>
                    <li style={{ padding: '6px 15px', cursor: 'pointer', color: '#333', fontWeight: 'bold' }}>Home</li>
                    <li style={{ padding: '6px 15px', cursor: 'pointer', color: '#333', fontWeight: 'bold', backgroundColor: 'white', borderLeft: '4px solid #d14836' }}>All items (333)</li>
                    <li style={{ padding: '6px 15px', cursor: 'pointer', color: '#333' }}>Starred items</li>
                    <li style={{ padding: '6px 15px', cursor: 'pointer', color: '#333' }}>Trends</li>
                    <li style={{ padding: '6px 15px', cursor: 'pointer', color: '#333' }}>Browse for stuff</li>
                </ul>

                <div style={{ marginTop: '20px' }}>
                    <div style={{ padding: '5px 15px', fontWeight: 'bold', color: '#333', cursor: 'pointer' }}>▼ Explore</div>
                </div>

                <div style={{ marginTop: '10px' }}>
                    <div style={{ padding: '5px 15px', fontWeight: 'bold', color: '#333', cursor: 'pointer' }}>▼ Subscriptions</div>
                    <ul style={{ listStyle: 'none', marginTop: '5px' }}>
                        {['Analytics (18)', 'Education General (10)', 'Edu Tech Mobile (2)', 'Edu Tech NewsWa... (218)', 'Marketing General (28)', 'Marketing Ed Tec... (30)', 'Publishing (7)', 'Software Models (13)'].map((item, i) => (
                            <li key={i} style={{
                                padding: '4px 15px 4px 35px',
                                cursor: 'pointer',
                                fontSize: '13px',
                                display: 'flex',
                                alignItems: 'center',
                                backgroundColor: item.includes('Marketing Ed Tec') ? '#dd4b39' : 'transparent',
                                color: item.includes('Marketing Ed Tec') ? 'white' : '#333'
                            }}>
                                <span style={{
                                    width: '10px',
                                    height: '10px',
                                    backgroundColor: '#666',
                                    marginRight: '8px',
                                    display: 'inline-block'
                                }}></span>
                                {item}
                            </li>
                        ))}
                    </ul>
                </div>
            </nav>
        </aside>
    );
}
