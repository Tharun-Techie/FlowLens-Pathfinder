import React, { useEffect, useRef, useState } from 'react';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force';
import { 
  Wallet, Building2, Shuffle, ArrowRight, 
  RotateCcw, ZoomIn, ZoomOut, Maximize, 
  Skull, FileCode, Landmark, HelpCircle 
} from 'lucide-react';

export default function NetworkGraph({ 
  nodes, 
  links, 
  selectedNodeId, 
  selectedLinkId, 
  onSelectNode, 
  onSelectLink,
  onExpandNode 
}) {
  const containerRef = useRef(null);
  const simulationRef = useRef(null);
  const isDraggingNodeRef = useRef(false);

  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });
  const [animatedNodes, setAnimatedNodes] = useState([]);
  const [animatedLinks, setAnimatedLinks] = useState([]);
  
  // Pan and Zoom
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  
  // Hover state
  const [hoveredNodeId, setHoveredNodeId] = useState(null);

  // Resize handler
  useEffect(() => {
    if (!containerRef.current) return;
    const handleResize = () => {
      setDimensions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight || 500
      });
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Run simulation when nodes/links change or dimensions change
  useEffect(() => {
    if (nodes.length === 0) {
      setAnimatedNodes([]);
      setAnimatedLinks([]);
      return;
    }

    // Copy nodes and links so D3 can mutate them safely
    const nodesCopy = nodes.map(d => ({ ...d }));
    const linksCopy = links.map(d => ({ ...d }));

    // If there is an existing simulation, stop it
    if (simulationRef.current) {
      simulationRef.current.stop();
    }

    // Initialize D3 Force simulation
    const sim = forceSimulation(nodesCopy)
      .force("link", forceLink(linksCopy).id(d => d.id).distance(130))
      .force("charge", forceManyBody().strength(-400))
      .force("collide", forceCollide().radius(d => d.valSize + 20))
      .force("center", forceCenter(dimensions.width / 2, dimensions.height / 2));

    simulationRef.current = sim;

    sim.on("tick", () => {
      setAnimatedNodes([...nodesCopy]);
      setAnimatedLinks([...linksCopy]);
    });

    // Run the simulation
    sim.alpha(1).restart();

    // Clean up
    return () => {
      sim.stop();
    };
  }, [nodes, links, dimensions.width, dimensions.height]);

  // Center/Reset graph view
  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleZoom = (factor) => {
    setZoom(prev => Math.max(0.1, Math.min(5, prev * factor)));
  };

  // Pan Canvas Mouse Events
  const handleMouseDown = (e) => {
    // If clicking a node, node drag handles the event instead of pan
    if (e.target.closest('.node-element') || isDraggingNodeRef.current) return;
    
    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e) => {
    if (!isPanning) return;
    setPan({
      x: e.clientX - panStart.x,
      y: e.clientY - panStart.y
    });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  // Node Drag Events
  const handleNodeDragStart = (e, node) => {
    e.stopPropagation();
    isDraggingNodeRef.current = true;
    
    // Find matching node in simulation
    const simNode = animatedNodes.find(n => n.id === node.id);
    if (!simNode) return;
    
    simNode.fx = simNode.x;
    simNode.fy = simNode.y;
    
    if (simulationRef.current) {
      simulationRef.current.alphaTarget(0.3).restart();
    }

    const handleDragMove = (moveEvent) => {
      // Convert screen coords back into SVG model coordinates by accounting for pan and zoom
      const svgContainer = containerRef.current.getBoundingClientRect();
      const clientX = moveEvent.clientX - svgContainer.left;
      const clientY = moveEvent.clientY - svgContainer.top;
      
      // Formula: (screen_pos - pan) / zoom
      simNode.fx = (clientX - pan.x) / zoom;
      simNode.fy = (clientY - pan.y) / zoom;
    };

    const handleDragEnd = () => {
      isDraggingNodeRef.current = false;
      simNode.fx = null;
      simNode.fy = null;
      if (simulationRef.current) {
        simulationRef.current.alphaTarget(0);
      }
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('mouseup', handleDragEnd);
    };

    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd);
  };

  // Mouse wheel zoom centering on pointer
  const handleWheel = (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    
    const svgRect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - svgRect.left;
    const mouseY = e.clientY - svgRect.top;
    
    // Calculate node coordinates under the pointer
    const modelX = (mouseX - pan.x) / zoom;
    const modelY = (mouseY - pan.y) / zoom;
    
    const nextZoom = Math.max(0.1, Math.min(5, zoom * zoomFactor));
    
    // Adjust pan so the model coordinate remains under the mouse
    setPan({
      x: mouseX - modelX * nextZoom,
      y: mouseY - modelY * nextZoom
    });
    setZoom(nextZoom);
  };

  // Node Color / Styling Mapper
  const getNodeColor = (type, isSelected) => {
    const colors = {
      target: { bg: '#FFD700', border: '#FFF', text: '#FFD700', glow: 'rgba(255, 215, 0, 0.4)' },
      exchange: { bg: '#1E88E5', border: '#90CAF9', text: '#64B5F6', glow: 'rgba(30, 136, 229, 0.3)' },
      mixer: { bg: '#8E24AA', border: '#E1BEE7', text: '#BA68C8', glow: 'rgba(142, 36, 170, 0.3)' },
      bridge: { bg: '#D81B60', border: '#F8BBD0', text: '#F06292', glow: 'rgba(216, 27, 96, 0.3)' },
      risk: { bg: '#E53935', border: '#FFCDD2', text: '#E57373', glow: 'rgba(229, 57, 53, 0.4)' },
      contract: { bg: '#FB8C00', border: '#FFE0B2', text: '#FFB74D', glow: 'rgba(251, 140, 0, 0.3)' },
      wallet: { bg: '#00ACC1', border: '#B2EBF2', text: '#4DD0E1', glow: 'rgba(0, 172, 193, 0.3)' }
    };
    
    return colors[type] || colors.wallet;
  };

  const getNodeIcon = (type) => {
    const props = { size: 14, color: '#FFFFFF' };
    switch (type) {
      case 'exchange': return <Landmark {...props} />;
      case 'mixer': return <Shuffle {...props} />;
      case 'bridge': return <RotateCcw {...props} style={{ transform: 'rotate(90deg)' }} />;
      case 'risk': return <Skull {...props} />;
      case 'contract': return <FileCode {...props} />;
      default: return <Wallet {...props} />;
    }
  };

  // Highlight and Path filtering logic
  const isDirectlyConnected = (nodeId) => {
    if (!selectedNodeId) return true;
    if (selectedNodeId === nodeId) return true;
    return links.some(link => {
      const srcId = typeof link.source === 'object' ? link.source.id : link.source;
      const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
      return (srcId === selectedNodeId && tgtId === nodeId) || (tgtId === selectedNodeId && srcId === nodeId);
    });
  };

  const getLinkHighlightClass = (link) => {
    if (!selectedNodeId) return '';
    const srcId = typeof link.source === 'object' ? link.source.id : link.source;
    const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
    if (srcId === selectedNodeId || tgtId === selectedNodeId) return 'highlighted';
    return 'dimmed';
  };

  const getNodeHighlightClass = (node) => {
    if (!selectedNodeId) return '';
    if (node.id === selectedNodeId) return 'active-selected';
    if (isDirectlyConnected(node.id)) return 'active-connected';
    return 'dimmed';
  };

  return (
    <div 
      className="network-graph-container" 
      ref={containerRef}
      onWheel={handleWheel}
      style={{ overflow: 'hidden', position: 'relative', width: '100%', height: '100%' }}
    >
      {/* Control Buttons Overlay */}
      <div className="graph-controls">
        <button onClick={() => handleZoom(1.2)} title="Zoom In"><ZoomIn size={16} /></button>
        <button onClick={() => handleZoom(0.8)} title="Zoom Out"><ZoomOut size={16} /></button>
        <button onClick={handleResetView} title="Reset View"><Maximize size={16} /></button>
        <span className="control-divider"></span>
        <span className="node-count-badge">{nodes.length} Nodes</span>
      </div>

      {/* SVG Canvas */}
      <svg
        width={dimensions.width}
        height={dimensions.height}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: isPanning ? 'grabbing' : 'grab', background: '#090A0F' }}
      >
        {/* Glow Filters and Defs */}
        <defs>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id="strong-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="10" result="blur" />
            <feComponentTransfer in="blur" result="boost">
              <feFuncA type="linear" slope="1.5" />
            </feComponentTransfer>
            <feComposite in="SourceGraphic" in2="boost" operator="over" />
          </filter>
        </defs>

        {/* Outer transform group for Pan/Zoom */}
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          
          {/* 1. DRAW LINKS (Lines) */}
          {animatedLinks.map((link) => {
            const source = link.source;
            const target = link.target;
            
            // Wait for positions to load
            if (typeof source !== 'object' || typeof target !== 'object') return null;

            const isSelected = selectedLinkId === link.id;
            const highlightClass = getLinkHighlightClass(link);
            
            // Calculate midpoint for arrowhead and labels
            const midX = (source.x + target.x) / 2;
            const midY = (source.y + target.y) / 2;
            
            // Compute angle of the link for labels
            const dx = target.x - source.x;
            const dy = target.y - source.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Skip extremely close overlapping positions
            if (distance < 5) return null;
            
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;

            // Arrow shape parameters
            const arrowLength = 8;
            const arrowWidth = 5;
            
            // Normalized direction vector
            const ux = dx / distance;
            const uy = dy / distance;

            // Draw arrowhead at the center of the link pointing to target
            const arrowHeadX = midX + ux * 5;
            const arrowHeadY = midY + uy * 5;
            const arrowPt1X = arrowHeadX - ux * arrowLength + uy * arrowWidth;
            const arrowPt1Y = arrowHeadY - uy * arrowLength - ux * arrowWidth;
            const arrowPt2X = arrowHeadX - ux * arrowLength - uy * arrowWidth;
            const arrowPt2Y = arrowHeadY - uy * arrowLength + ux * arrowWidth;

            // Flow animation speed depending on transaction value
            // Large value = faster animation
            const logVal = Math.log10(link.value + 1.1);
            const flowDuration = Math.max(0.3, 4 - logVal * 0.8);

            return (
              <g 
                key={link.id} 
                className={`link-element ${highlightClass} ${isSelected ? 'selected' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectLink(link);
                }}
              >
                {/* Thick invisible interaction area for easy hover/click */}
                <line
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  stroke="transparent"
                  strokeWidth={15}
                  style={{ cursor: 'pointer' }}
                />

                {/* Visible link line */}
                <line
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  stroke={isSelected ? '#66FCF1' : '#1F2833'}
                  strokeWidth={isSelected ? 3 : Math.min(6, 1.5 + logVal)}
                  className="tx-link"
                  style={{
                    animationDuration: `${flowDuration}s`,
                    stroke: isSelected ? '#66FCF1' : highlightClass === 'dimmed' ? '#11141a' : '#45A29E',
                  }}
                />

                {/* Mid-point Arrowhead */}
                <polygon
                  points={`${arrowHeadX},${arrowHeadY} ${arrowPt1X},${arrowPt1Y} ${arrowPt2X},${arrowPt2Y}`}
                  fill={isSelected ? '#66FCF1' : highlightClass === 'dimmed' ? '#1f2630' : '#45A29E'}
                  opacity={highlightClass === 'dimmed' ? 0.3 : 1}
                />

                {/* Amount overlay badge in the middle of link */}
                {hoveredNodeId === null && distance > 60 && (
                  <g transform={`translate(${midX}, ${midY - 8})`}>
                    <rect
                      x={-35}
                      y={-8}
                      width={70}
                      height={15}
                      rx={3}
                      fill="#0B0C10"
                      stroke="#1F2833"
                      strokeWidth={1}
                      opacity={highlightClass === 'dimmed' ? 0.1 : 0.85}
                    />
                    <text
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill={isSelected ? '#66FCF1' : '#C5C6C7'}
                      fontSize={9}
                      fontWeight="bold"
                      opacity={highlightClass === 'dimmed' ? 0.2 : 1}
                    >
                      {link.value > 1000 ? `${(link.value / 1000).toFixed(1)}k` : link.value.toFixed(1)} USDT
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* 2. DRAW NODES (Circles + Labels) */}
          {animatedNodes.map((node) => {
            const isSelected = selectedNodeId === node.id;
            const isHovered = hoveredNodeId === node.id;
            const highlightClass = getNodeHighlightClass(node);
            const nodeStyle = getNodeColor(node.type);

            return (
              <g
                key={node.id}
                className={`node-element ${highlightClass}`}
                transform={`translate(${node.x || 0}, ${node.y || 0})`}
                onMouseDown={(e) => handleNodeDragStart(e, node)}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectNode(node);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onExpandNode(node.id);
                }}
                onMouseEnter={() => setHoveredNodeId(node.id)}
                onMouseLeave={() => setHoveredNodeId(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* 2a. Glowing halo for target/queried nodes */}
                {node.isQueried && (
                  <circle
                    r={node.valSize + 10}
                    fill="none"
                    stroke="#FFD700"
                    strokeWidth={2}
                    className="pulse-halo"
                    style={{
                      opacity: highlightClass === 'dimmed' ? 0.15 : 0.4,
                      filter: 'url(#glow)'
                    }}
                  />
                )}

                {/* 2b. Outer ring for hover / selection */}
                <circle
                  r={node.valSize + 4}
                  fill="none"
                  stroke={isSelected ? '#66FCF1' : isHovered ? '#C5C6C7' : 'transparent'}
                  strokeWidth={2}
                  style={{
                    opacity: isSelected ? 1 : 0.7,
                    filter: isSelected ? 'url(#strong-glow)' : 'none'
                  }}
                />

                {/* 2c. Base circle body (Glassmorphic look) */}
                <circle
                  r={node.valSize}
                  fill="#1F2833"
                  stroke={nodeStyle.bg}
                  strokeWidth={node.isQueried ? 3 : 2}
                  style={{
                    boxShadow: `0 0 15px ${nodeStyle.glow}`,
                    fill: node.isQueried ? '#121217' : '#1F2833',
                    opacity: highlightClass === 'dimmed' ? 0.3 : 1
                  }}
                />

                {/* 2d. Node Center Icon (centered using foreignObject) */}
                <foreignObject
                  x={-10}
                  y={-10}
                  width={20}
                  height={20}
                  style={{ pointerEvents: 'none', opacity: highlightClass === 'dimmed' ? 0.3 : 1 }}
                >
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    width: '100%', 
                    height: '100%' 
                  }}>
                    {node.isQueried ? (
                      <span style={{ color: '#FFD700', fontSize: '10px', fontWeight: 'bold' }}>MAIN</span>
                    ) : (
                      getNodeIcon(node.type)
                    )}
                  </div>
                </foreignObject>

                {/* 2e. Labels */}
                <g 
                  transform={`translate(0, ${node.valSize + 14})`}
                  opacity={highlightClass === 'dimmed' ? 0.35 : 1}
                >
                  {/* Alias Name if present */}
                  {node.alias && (
                    <text
                      textAnchor="middle"
                      fill="#FFD700"
                      fontSize={10}
                      fontWeight="600"
                      y={-12}
                    >
                      {node.alias}
                    </text>
                  )}
                  
                  {/* Address hash truncated */}
                  <text
                    textAnchor="middle"
                    fill={node.isQueried ? '#FFD700' : isSelected ? '#66FCF1' : '#C5C6C7'}
                    fontSize={11}
                    fontWeight={node.isQueried || isSelected ? 'bold' : 'normal'}
                  >
                    {node.label}
                  </text>
                  
                  {/* Small Type Label on hover */}
                  {(isHovered || isSelected) && (
                    <text
                      textAnchor="middle"
                      fill="#45A29E"
                      fontSize={9}
                      y={12}
                    >
                      {node.type.toUpperCase()} • {node.txCount} txs
                    </text>
                  )}
                </g>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Floating Network Legend overlay */}
      <div className="graph-legend">
        <div className="legend-title">Address Categories</div>
        <div className="legend-items">
          <div className="legend-item"><span className="legend-dot target"></span> Queried Target</div>
          <div className="legend-item"><span className="legend-dot exchange"></span> Exchange</div>
          <div className="legend-item"><span className="legend-dot mixer"></span> Mixer</div>
          <div className="legend-item"><span className="legend-dot bridge"></span> Bridge</div>
          <div className="legend-item"><span className="legend-dot risk"></span> Risk / Phishing</div>
          <div className="legend-item"><span className="legend-dot contract"></span> Smart Contract</div>
          <div className="legend-item"><span className="legend-dot wallet"></span> Standard Wallet</div>
        </div>
        <div className="legend-tip">💡 Double click a node to expand its cash flows!</div>
      </div>
    </div>
  );
}
