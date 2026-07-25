import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  MousePointer2,
  Pen,
  StickyNote,
  Type,
  Undo,
  Redo,
  RotateCcw
} from 'lucide-react';
import './Whiteboard.css';
import LoadingScreen from '@/shared/components/LoadingScreen';

type WBPoint = { x: number; y: number };
type WBElement = any;
type WBPath = WBPoint[];

const Loader = ({ text }: { text: string }) => <LoadingScreen message={text} subMessage="" />;

export default function Whiteboard() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [selectedTool, setSelectedTool] = useState('cursor');
  const [isDrawing, setIsDrawing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [panOffset, setPanOffset] = useState<WBPoint>({ x: 0, y: 0 });
  const [elements, setElements] = useState<WBElement[]>([]);
  const [history, setHistory] = useState<Array<{ elements: WBElement[]; drawingPaths: WBPath[] }>>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [editingElement, setEditingElement] = useState<WBElement | null>(null);
  const [drawingPaths, setDrawingPaths] = useState<WBPath[]>([]);
  const [currentPath, setCurrentPath] = useState<WBPath>([]);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [draggedElement, setDraggedElement] = useState<WBElement | null>(null);
  const [dragOffset, setDragOffset] = useState<WBPoint>({ x: 0, y: 0 });
  const [isRightClickPanning, setIsRightClickPanning] = useState(false);

  // Initialize canvas with retry mechanism
  useEffect(() => {
    console.log('🎯 Whiteboard useEffect - initializing canvas');
    
    const initializeCanvas = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        console.log('❌ Canvas not found, retrying in 50ms...');
        setTimeout(initializeCanvas, 50);
        return;
      }
      
      console.log('✅ Canvas found, initializing...');
      canvas.getContext('2d');
      canvas.width = 2000;
      canvas.height = 1000;
      console.log('✅ Canvas initialized successfully');
      
      // Load saved data after canvas is ready
      console.log('🔄 Calling loadSavedData...');
      loadSavedData();
    };
    
    // Start initialization
    initializeCanvas();
    
    // Immediate fallback - set loading to true after a short delay
    const immediateTimeout = setTimeout(() => {
      console.log('⚡ Immediate fallback - setting loading to true');
      setIsDataLoaded(true);
    }, 200); // 200ms fallback
    
    // Longer timeout as backup
    const timeout = setTimeout(() => {
      console.log('⚠️ Whiteboard loading timeout - forcing load completion');
      setIsDataLoaded(true);
    }, 3000); // 3 second timeout
    
    return () => {
      clearTimeout(immediateTimeout);
      clearTimeout(timeout);
    };
  }, []);

  // Render elements after data is loaded
  useEffect(() => {
    if (!isDataLoaded) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d')!;

    // Draw initial background
    drawBackground(ctx);

    // Render elements directly here instead of calling renderElements
    // This avoids the "before initialization" error
    const renderElementsDirect = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d')!;
      
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw background
      drawBackground(ctx);
      
      // Draw all drawing paths
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      drawingPaths.forEach(path => {
        if (path.length > 0) {
          ctx.beginPath();
          ctx.moveTo(path[0].x, path[0].y);
          for (let i = 1; i < path.length; i++) {
            ctx.lineTo(path[i].x, path[i].y);
          }
          ctx.stroke();
        }
      });
      
      // Draw all elements
      elements.forEach(element => {
        if (element.type === 'sticky') {
          // Draw sticky note
          ctx.fillStyle = element.color;
          ctx.strokeStyle = element.borderColor;
          ctx.lineWidth = 2;
          ctx.fillRect(element.x, element.y, element.width, element.height);
          ctx.strokeRect(element.x, element.y, element.width, element.height);
          
          // Draw text
          ctx.fillStyle = '#333';
          ctx.font = '12px Arial';
          ctx.fillText(element.text, element.x + 10, element.y + 25);
        } else if (element.type === 'text') {
          // Draw text
          ctx.fillStyle = element.color;
          ctx.font = `${element.fontSize}px Arial`;
          ctx.fillText(element.text, element.x, element.y + element.fontSize);
        }
      });
    };
    
    renderElementsDirect();
  }, [isDataLoaded, elements, drawingPaths]);

  // Track previous state to detect actual changes
  const prevStateRef = useRef<any>({
    elements: [],
    history: [],
    historyIndex: -1,
    panOffset: { x: 0, y: 0 },
    drawingPaths: []
  });

  // Save data to database only when actual changes are detected
  useEffect(() => {
    if (!isDataLoaded) return; // Don't save while loading
    
    const currentState = {
      elements,
      history,
      historyIndex,
      panOffset,
      drawingPaths
    };
    
    // Check if there are actual changes
    const hasChanges = JSON.stringify(currentState) !== JSON.stringify(prevStateRef.current);
    
    if (hasChanges) {
      console.log('🔄 Whiteboard state changed, scheduling save...');
      
      const timeoutId = setTimeout(() => {
        saveToDatabase(currentState);
        prevStateRef.current = currentState; // Update previous state after save
      }, 1000); // Save every 1 second after changes

      return () => clearTimeout(timeoutId);
    }
  }, [elements, history, historyIndex, panOffset, drawingPaths, isDataLoaded]);

  // Save data when component unmounts (switching tabs) - only if there are changes
  useEffect(() => {
    return () => {
      if (isDataLoaded) {
        const currentState = {
          elements,
          history,
          historyIndex,
          panOffset,
          drawingPaths
        };
        
        // Only save if there are actual changes
        const hasChanges = JSON.stringify(currentState) !== JSON.stringify(prevStateRef.current);
        
        if (hasChanges) {
          console.log('🔄 Whiteboard unmounting with changes, saving...');
          saveToDatabaseSync(currentState);
        } else {
          console.log('ℹ️ Whiteboard unmounting with no changes, skipping save');
        }
      }
    };
  }, [elements, history, historyIndex, panOffset, drawingPaths, isDataLoaded]);

  const loadSavedData = async () => {
    console.log('🚀 loadSavedData function called');
    try {
      const token = localStorage.getItem('token');
      console.log('🔑 Token check:', token ? 'Found' : 'Not found');
      
      if (!token) {
        console.log('⚠️ No token found for whiteboard data loading');
        setIsDataLoaded(true); // Set loaded even without token
        return;
      }

      console.log('🔄 Loading whiteboard data...');
      const response = await fetch('/api/whiteboard', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('📡 Response status:', response.status);
      
      if (response.ok) {
        const result = await response.json();
        console.log('📋 Whiteboard data response:', result);
        if (result.data) {
          const data = result.data;
          console.log('📋 Loading whiteboard data:', {
            elements: data.elements?.length || 0,
            history: data.history?.length || 0,
            drawingPaths: data.drawingPaths?.length || 0
          });
          setElements(data.elements || []);
          setHistory(data.history || []);
          setHistoryIndex(data.historyIndex || -1);
          setPanOffset(data.panOffset || { x: 0, y: 0 });
          setDrawingPaths(data.drawingPaths || []);
          console.log('✅ Whiteboard data loaded successfully');
        } else {
          console.log('ℹ️ No whiteboard data found for user');
        }
      } else {
        console.error('❌ Failed to load whiteboard data:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('❌ Error loading saved data:', error);
    } finally {
      // Always set data as loaded, even if there was an error
      console.log('🏁 Setting isDataLoaded to true');
      setIsDataLoaded(true);
      console.log('✅ Whiteboard loading completed');
    }
  };

  const saveToDatabase = async (data) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        console.log('⚠️ No token found for whiteboard data saving');
        return;
      }

      // Reduced logging to prevent console spam
      console.log('💾 Saving whiteboard data...');

      const response = await fetch('/api/whiteboard', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ data })
      });

      if (response.ok) {
        console.log('✅ Whiteboard data saved successfully');
      } else {
        console.error('❌ Failed to save whiteboard data:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('❌ Error saving to database:', error);
    }
  };

  const saveToDatabaseSync = (data) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        console.log('⚠️ No token found for whiteboard data saving');
        return;
      }

      console.log('💾 Sync saving whiteboard data on unmount...');

      // Use synchronous XMLHttpRequest for reliable unmount saving
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/whiteboard', false); // synchronous
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify({ data }));
      
      if (xhr.status === 200) {
        console.log('✅ Whiteboard data sync saved successfully');
      } else {
        console.error('❌ Failed to sync save whiteboard data:', xhr.status, xhr.statusText);
      }
    } catch (error) {
      console.error('❌ Error sync saving to database:', error);
    }
  };

  const drawBackground = (ctx) => {
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    
    // Draw grid
    const gridSize = 20;
    ctx.strokeStyle = '#e9ecef';
    ctx.lineWidth = 0.5;
    
    for (let x = 0; x <= ctx.canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, ctx.canvas.height);
      ctx.stroke();
    }
    
    for (let y = 0; y <= ctx.canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(ctx.canvas.width, y);
      ctx.stroke();
    }
  };

  const handleToolSelect = (tool) => {
    setSelectedTool(tool);
  };


  // Get accurate mouse coordinates - using browser's transformation matrix
  const getMousePos = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    
    // Get mouse position relative to the canvas element
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // The canvas has intrinsic size 2000x1000 but is displayed at rect.width x rect.height
    // Calculate the scale factor between displayed size and intrinsic size
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    // Convert to canvas coordinates (before any CSS transforms)
    const canvasX = mouseX * scaleX;
    const canvasY = mouseY * scaleY;
    
    // Simple coordinate calculation without zoom
    const x = canvasX - panOffset.x;
    const y = canvasY - panOffset.y;
    
    return { x, y };
  };

  const handleMouseDown = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { x, y } = getMousePos(e);
    
    // Debug coordinate calculation
    if (selectedTool === 'pen') {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const canvasX = mouseX * scaleX;
      const canvasY = mouseY * scaleY;
      console.log('🖊️ Mouse debug:', {
        mousePos: { x: Math.round(mouseX), y: Math.round(mouseY) },
        canvasSize: { width: canvas.width, height: canvas.height },
        displaySize: { width: Math.round(rect.width), height: Math.round(rect.height) },
        scale: { x: scaleX.toFixed(3), y: scaleY.toFixed(3) },
        canvasCoords: { x: Math.round(canvasX), y: Math.round(canvasY) },
        panOffset,
        finalCoords: { x: Math.round(x), y: Math.round(y) }
      });
    }

    if (selectedTool === 'pen') {
      setIsDrawing(true);
      setCurrentPath([{ x, y }]);
    } else if (selectedTool === 'sticky') {
      addStickyNote(x, y);
    } else if (selectedTool === 'text') {
      addText(x, y);
    } else if (selectedTool === 'cursor') {
      // Handle cursor interactions
      const clickedElement = elements.find(el => 
        x >= el.x && x <= el.x + el.width && 
        y >= el.y && y <= el.y + el.height
      );
      
      if (clickedElement) {
        setDraggedElement(clickedElement);
        setDragOffset({ x: x - clickedElement.x, y: y - clickedElement.y });
      }
    }
  };

  const handleMouseMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { x, y } = getMousePos(e);

    if (isDrawing && selectedTool === 'pen') {
      setCurrentPath(prev => [...prev, { x, y }]);
    }

    if (draggedElement) {
      setElements(prev => prev.map(el => 
        el.id === draggedElement.id 
          ? { ...el, x: x - dragOffset.x, y: y - dragOffset.y }
          : el
      ));
    }
  };

  const handleMouseUp = (e) => {
    if (isDrawing && selectedTool === 'pen') {
      setIsDrawing(false);
      setDrawingPaths(prev => [...prev, [...currentPath]]);
      setCurrentPath([]);
      saveState();
    }
    if (isDragging) {
      setIsDragging(false);
    }
    if (draggedElement) {
      setDraggedElement(null);
      setDragOffset({ x: 0, y: 0 });
      saveState();
    }
    if (isRightClickPanning) {
      setIsRightClickPanning(false);
    }
  };


  const handleContextMenu = (e) => {
    e.preventDefault();
    if (selectedTool === 'cursor') {
      setIsRightClickPanning(true);
    }
  };

  const saveState = useCallback(() => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({
      elements: [...elements],
      drawingPaths: [...drawingPaths]
    });
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [elements, drawingPaths, history, historyIndex]);

  const addStickyNote = (x, y) => {
    const newElement = {
      id: Date.now().toString(),
      type: 'sticky',
      x,
      y,
      width: 200,
      height: 150,
      text: 'Double-click to edit',
      color: '#ffeb3b',
      borderColor: '#fbc02d'
    };
    
    setElements(prev => [...prev, newElement]);
    setEditingElement(newElement);
    saveState();
  };

  const addText = (x, y) => {
    const newElement = {
      id: Date.now().toString(),
      type: 'text',
      x,
      y,
      text: 'Click to edit',
      color: '#000000',
      fontSize: 16
    };
    
    setElements(prev => [...prev, newElement]);
    setEditingElement(newElement);
    saveState();
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevState = history[historyIndex - 1];
      setElements(prevState.elements);
      setDrawingPaths(prevState.drawingPaths);
      setHistoryIndex(historyIndex - 1);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextState = history[historyIndex + 1];
      setElements(nextState.elements);
      setDrawingPaths(nextState.drawingPaths);
      setHistoryIndex(historyIndex + 1);
    }
  };

  const handleClear = () => {
    if (window.confirm('Are you sure you want to clear the whiteboard?')) {
      setElements([]);
      setDrawingPaths([]);
      setHistory([]);
      setHistoryIndex(-1);
      setPanOffset({ x: 0, y: 0 });
      
      saveToDatabase({
        elements: [],
        history: [],
        historyIndex: -1,
        panOffset: { x: 0, y: 0 },
        drawingPaths: []
      });
      
      saveState();
    }
  };


  const handleSaveAsPNG = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCanvas.width = 2000;
    tempCanvas.height = 1000;
    
    // Draw background
    tempCtx.fillStyle = '#f8f9fa';
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    
    // Draw all drawing paths
    tempCtx.strokeStyle = '#000000';
    tempCtx.lineWidth = 2;
    tempCtx.lineCap = 'round';
    tempCtx.lineJoin = 'round';
    
    drawingPaths.forEach(path => {
      if (path.length > 0) {
        tempCtx.beginPath();
        tempCtx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) {
          tempCtx.lineTo(path[i].x, path[i].y);
        }
        tempCtx.stroke();
      }
    });
    
    // Draw elements
    elements.forEach(element => {
      if (element.type === 'sticky') {
        // Draw sticky note
        tempCtx.fillStyle = element.color;
        tempCtx.strokeStyle = element.borderColor;
        tempCtx.lineWidth = 2;
        tempCtx.fillRect(element.x, element.y, element.width, element.height);
        tempCtx.strokeRect(element.x, element.y, element.width, element.height);
        
        // Draw text
        tempCtx.fillStyle = '#333';
        tempCtx.font = '12px Arial';
        tempCtx.fillText(element.text, element.x + 10, element.y + 25);
      } else if (element.type === 'text') {
        // Draw text
        tempCtx.fillStyle = element.color;
        tempCtx.font = `${element.fontSize}px Arial`;
        tempCtx.fillText(element.text, element.x, element.y + element.fontSize);
      }
    });
    
    // Convert to PNG and download
    const link = document.createElement('a');
    link.download = `whiteboard-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`;
    link.href = tempCanvas.toDataURL('image/png');
    link.click();
  };

  const handleTextEdit = (elementId: any, newText: string) => {
    setElements(prev => prev.map(el =>
      el.id === elementId ? { ...el, text: newText } : el
    ));
    setEditingElement(null);
    saveState();
  };

  const renderElements = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d')!;
    
    // Clear and redraw background
    drawBackground(ctx);
    
    // Draw all drawing paths
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    drawingPaths.forEach(path => {
      if (path.length > 0) {
        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) {
          ctx.lineTo(path[i].x, path[i].y);
        }
        ctx.stroke();
      }
    });
    
    // Draw current path being drawn
    if (currentPath.length > 0) {
      ctx.beginPath();
      ctx.moveTo(currentPath[0].x, currentPath[0].y);
      for (let i = 1; i < currentPath.length; i++) {
        ctx.lineTo(currentPath[i].x, currentPath[i].y);
      }
      ctx.stroke();
    }
    
    // Draw all elements
    elements.forEach(element => {
      if (element.type === 'sticky') {
        // Draw sticky note
        ctx.fillStyle = element.color;
        ctx.strokeStyle = element.borderColor;
        ctx.lineWidth = 2;
        ctx.fillRect(element.x, element.y, element.width, element.height);
        ctx.strokeRect(element.x, element.y, element.width, element.height);
        
        // Draw text
        ctx.fillStyle = '#333';
        ctx.font = '12px Arial';
        ctx.fillText(element.text, element.x + 10, element.y + 25);
      } else if (element.type === 'text') {
        // Draw text
        ctx.fillStyle = element.color;
        ctx.font = `${element.fontSize}px Arial`;
        ctx.fillText(element.text, element.x, element.y + element.fontSize);
      }
    });
  }, [elements, drawingPaths, currentPath]);

  // Re-render elements when they change
  useEffect(() => {
    renderElements();
  }, [renderElements]);

  // Always render the canvas, but show loading overlay if data not loaded
  return (
    <div className="whiteboard-container">
      <div className="whiteboard-surface">
        {/* Toolbar - only show when data is loaded */}
        {isDataLoaded && (
          <div className="whiteboard-toolbar">
            {/* Drawing Tools */}
            <div className="tool-group">
              <button 
                className={`tool-btn ${selectedTool === 'cursor' ? 'active' : ''}`}
                onClick={() => handleToolSelect('cursor')}
                title="Cursor"
              >
                <MousePointer2 size={20} />
              </button>
              <button 
                className={`tool-btn ${selectedTool === 'pen' ? 'active' : ''}`}
                onClick={() => handleToolSelect('pen')}
                title="Pen"
              >
                <Pen size={20} />
              </button>
              <button 
                className={`tool-btn ${selectedTool === 'sticky' ? 'active' : ''}`}
                onClick={() => handleToolSelect('sticky')}
                title="Sticky Note"
              >
                <StickyNote size={20} />
              </button>
              <button 
                className={`tool-btn ${selectedTool === 'text' ? 'active' : ''}`}
                onClick={() => handleToolSelect('text')}
                title="Text"
              >
                <Type size={20} />
              </button>
            </div>

            {/* Action Tools */}
            <div className="tool-group">
              <button 
                className="tool-btn" 
                onClick={handleUndo}
                disabled={historyIndex < 0}
                title="Undo"
              >
                <Undo size={20} />
              </button>
              <button 
                className="tool-btn" 
                onClick={handleRedo}
                disabled={historyIndex >= history.length - 1}
                title="Redo"
              >
                <Redo size={20} />
              </button>
              <button 
                className="tool-btn" 
                onClick={handleClear}
                title="Clear All"
              >
                <RotateCcw size={20} />
              </button>
            </div>


            {/* Action Buttons */}
            <div className="tool-group">
              <button 
                className="tool-btn clear-btn" 
                onClick={handleClear}
                title="Clear All"
              >
                Clear
              </button>
              <button 
                className="tool-btn save-btn" 
                onClick={handleSaveAsPNG}
                title="Save as PNG"
              >
                Save as PNG
              </button>
            </div>
          </div>
        )}

        {/* Always render the canvas */}
        <div 
          className="whiteboard-canvas-container"
        >
          <canvas 
            ref={canvasRef} 
            className="whiteboard-canvas"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onContextMenu={handleContextMenu}
            style={{
              transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
              transformOrigin: '0 0',
              cursor: selectedTool === 'cursor' ? 'default' : 
                     selectedTool === 'pen' ? 'crosshair' : 'pointer'
            }}
          />
        </div>
      </div>

      {/* Show loading overlay if data not loaded */}
      {!isDataLoaded && (
        <div className="whiteboard-loading-overlay">
          <Loader text="Loading whiteboard..." />
        </div>
      )}

      {/* Text editing modal */}
      {editingElement && (
        <div className="text-edit-modal">
          <input
            type="text"
            value={editingElement.text}
            onChange={(e) => setEditingElement({...editingElement, text: e.target.value})}
            onBlur={() => handleTextEdit(editingElement.id, editingElement.text)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleTextEdit(editingElement.id, editingElement.text);
              }
            }}
            autoFocus
          />
        </div>
      )}
    </div>
  );
}
