import React, { useState, useRef, useEffect } from 'react';

export default function TimelineChart({ timeline }) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(500);
  const [hoveredIdx, setHoveredIdx] = useState(null);
  
  const height = 150;
  const paddingLeft = 45;
  const paddingRight = 15;
  const paddingTop = 15;
  const paddingBottom = 25;

  useEffect(() => {
    if (!containerRef.current) return;
    const handleResize = () => {
      setWidth(containerRef.current.clientWidth);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!timeline || timeline.length === 0) {
    return (
      <div className="empty-chart" style={{ 
        height: `${height}px`, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        color: '#45A29E',
        background: '#0B0C10',
        borderRadius: '6px',
        border: '1px dashed #1F2833',
        fontSize: '13px'
      }}>
        No transaction history timeline available.
      </div>
    );
  }

  // Chart area dimensions
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // Find max value for scaling
  const maxVal = Math.max(
    ...timeline.map(d => Math.max(d.sent, d.received)),
    10.0 // minimum scale default
  );

  // Map dates and values to coordinates
  const points = timeline.map((d, i) => {
    const x = paddingLeft + (timeline.length > 1 ? (i / (timeline.length - 1)) * chartWidth : chartWidth / 2);
    const ySent = height - paddingBottom - (d.sent / maxVal) * chartHeight;
    const yReceived = height - paddingBottom - (d.received / maxVal) * chartHeight;
    return { x, ySent, yReceived, ...d };
  });

  // Build SVG Paths
  const buildLinePath = (pointKey) => {
    if (points.length === 0) return '';
    return points.reduce((path, pt, i) => {
      const yVal = pt[pointKey];
      return i === 0 ? `M ${pt.x} ${yVal}` : `${path} L ${pt.x} ${yVal}`;
    }, '');
  };

  const buildAreaPath = (pointKey) => {
    if (points.length === 0) return '';
    const linePath = buildLinePath(pointKey);
    const firstX = points[0].x;
    const lastX = points[points.length - 1].x;
    const baseY = height - paddingBottom;
    return `${linePath} L ${lastX} ${baseY} L ${firstX} ${baseY} Z`;
  };

  const sentPath = buildLinePath('ySent');
  const receivedPath = buildLinePath('yReceived');
  
  const sentAreaPath = buildAreaPath('ySent');
  const receivedAreaPath = buildAreaPath('yReceived');

  // Y-axis labels helper (grid divisions)
  const yTicks = [0, maxVal / 2, maxVal];
  
  // X-axis labels (draw first, middle, last dates)
  const getXTicks = () => {
    if (timeline.length === 0) return [];
    if (timeline.length <= 3) return points;
    const midIdx = Math.floor(points.length / 2);
    return [points[0], points[midIdx], points[points.length - 1]];
  };
  const xTicks = getXTicks();

  // Mouse hover detection
  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    
    // Find closest data point by X coordinate
    let closestDist = Infinity;
    let closestIdx = 0;
    
    points.forEach((pt, i) => {
      const dist = Math.abs(pt.x - mouseX);
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = i;
      }
    });
    
    setHoveredIdx(closestIdx);
  };

  const handleMouseLeave = () => {
    setHoveredIdx(null);
  };

  const hoveredPoint = hoveredIdx !== null ? points[hoveredIdx] : null;

  return (
    <div 
      className="timeline-chart-container" 
      ref={containerRef} 
      style={{ position: 'relative', width: '100%', background: '#0B0C10', padding: '10px', borderRadius: '8px', border: '1px solid #1F2833' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div style={{ fontSize: '11px', color: '#8892b0', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Transaction Timeline Analysis
        </div>
        <div style={{ display: 'flex', gap: '15px', fontSize: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#00E676' }}>
            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#00E676' }}></span>
            Received USDT
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#FF4D4D' }}>
            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#FF4D4D' }}></span>
            Sent USDT
          </div>
        </div>
      </div>

      <svg 
        width={width} 
        height={height} 
        onMouseMove={handleMouseMove} 
        onMouseLeave={handleMouseLeave}
        style={{ overflow: 'visible' }}
      >
        <defs>
          <linearGradient id="sent-area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FF4D4D" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#FF4D4D" stopOpacity="0.0" />
          </linearGradient>
          <linearGradient id="received-area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00E676" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#00E676" stopOpacity="0.0" />
          </linearGradient>
          <filter id="glow-emerald" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id="glow-rose" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* 1. Grid Lines (Horizontal) */}
        {yTicks.map((tick, i) => {
          const y = height - paddingBottom - (tick / maxVal) * chartHeight;
          return (
            <g key={i}>
              <line 
                x1={paddingLeft} 
                y1={y} 
                x2={width - paddingRight} 
                y2={y} 
                stroke="#1F2833" 
                strokeWidth={1} 
                strokeDasharray="3 3" 
              />
              <text 
                x={paddingLeft - 8} 
                y={y} 
                textAnchor="end" 
                dominantBaseline="middle" 
                fill="#45A29E" 
                fontSize={9}
              >
                {tick >= 1000 ? `${(tick / 1000).toFixed(1)}k` : tick.toFixed(0)}
              </text>
            </g>
          );
        })}

        {/* 2. Gradient Area Fills */}
        {timeline.length > 0 && (
          <>
            <path d={receivedAreaPath} fill="url(#received-area-grad)" />
            <path d={sentAreaPath} fill="url(#sent-area-grad)" />
          </>
        )}

        {/* 3. Trend Lines */}
        {timeline.length > 0 && (
          <>
            <path 
              d={receivedPath} 
              fill="none" 
              stroke="#00E676" 
              strokeWidth={2} 
              style={{ filter: 'url(#glow-emerald)' }} 
            />
            <path 
              d={sentPath} 
              fill="none" 
              stroke="#FF4D4D" 
              strokeWidth={2} 
              style={{ filter: 'url(#glow-rose)' }} 
            />
          </>
        )}

        {/* 4. X-Axis (Timeline dates) */}
        <line 
          x1={paddingLeft} 
          y1={height - paddingBottom} 
          x2={width - paddingRight} 
          y2={height - paddingBottom} 
          stroke="#1F2833" 
          strokeWidth={1.5} 
        />
        {xTicks.map((tick, i) => (
          <text 
            key={i} 
            x={tick.x} 
            y={height - paddingBottom + 14} 
            textAnchor="middle" 
            fill="#45A29E" 
            fontSize={9}
          >
            {tick.date.substring(5)} {/* show MM-DD */}
          </text>
        ))}

        {/* 5. Hover guide line and details */}
        {hoveredPoint && (
          <g>
            <line 
              x1={hoveredPoint.x} 
              y1={paddingTop} 
              x2={hoveredPoint.x} 
              y2={height - paddingBottom} 
              stroke="#66FCF1" 
              strokeWidth={1.5} 
              strokeDasharray="4 4" 
            />
            {/* Sent Hover Point */}
            <circle cx={hoveredPoint.x} cy={hoveredPoint.ySent} r={4.5} fill="#FF4D4D" stroke="#0B0C10" strokeWidth={1.5} />
            {/* Received Hover Point */}
            <circle cx={hoveredPoint.x} cy={hoveredPoint.yReceived} r={4.5} fill="#00E676" stroke="#0B0C10" strokeWidth={1.5} />
          </g>
        )}
      </svg>

      {/* Floating Hover Tooltip */}
      {hoveredPoint && (
        <div style={{
          position: 'absolute',
          top: '40px',
          left: `${Math.min(width - 160, Math.max(paddingLeft + 10, hoveredPoint.x - 70))}px`,
          background: 'rgba(31, 40, 51, 0.95)',
          border: '1px solid #45A29E',
          borderRadius: '4px',
          padding: '6px 10px',
          pointerEvents: 'none',
          zIndex: 10,
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          width: '130px',
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{ fontSize: '9px', color: '#45A29E', fontWeight: 'bold', marginBottom: '4px' }}>
            {hoveredPoint.date}
          </div>
          <div style={{ fontSize: '10px', color: '#C5C6C7', display: 'flex', justifyContent: 'space-between' }}>
            <span>Received:</span>
            <span style={{ color: '#00E676', fontWeight: 'bold' }}>{hoveredPoint.received.toFixed(1)} USDT</span>
          </div>
          <div style={{ fontSize: '10px', color: '#C5C6C7', display: 'flex', justifyContent: 'space-between' }}>
            <span>Sent:</span>
            <span style={{ color: '#FF4D4D', fontWeight: 'bold' }}>{hoveredPoint.sent.toFixed(1)} USDT</span>
          </div>
          <div style={{ fontSize: '9px', color: '#8892b0', marginTop: '4px', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #1F2833', paddingTop: '3px' }}>
            <span>Transactions:</span>
            <span>{hoveredPoint.count}</span>
          </div>
        </div>
      )}
    </div>
  );
}
