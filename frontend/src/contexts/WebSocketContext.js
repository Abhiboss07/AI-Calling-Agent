'use client';

import React, { createContext, useContext, useReducer, useEffect, useRef, useCallback } from 'react';
import { API_BASE } from '../lib/api';

// Real-time WebSocket context for live call monitoring
const WebSocketContext = createContext();

// Action types for real-time updates
const WS_ACTIONS = {
  CONNECTING: 'connecting',
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  CALL_STARTED: 'call_started',
  CALL_ENDED: 'call_ended',
  AUDIO_RECEIVED: 'audio_received',
  TRANSCRIPT_UPDATED: 'transcript_updated',
  AGENT_SPEAKING: 'agent_speaking',
  CUSTOMER_SPEAKING: 'customer_speaking',
  METRICS_UPDATED: 'metrics_updated',
  ERROR: 'error'
};

// Initial state
const initialState = {
  connected: false,
  connecting: false,
  calls: [],
  activeCall: null,
  metrics: {
    totalCalls: 0,
    activeCalls: 0,
    averageDuration: 0
  },
  transcripts: {},
  error: null
};

// Reducer for real-time state updates
function wsReducer(state, action) {
  switch (action.type) {
    case WS_ACTIONS.CONNECTING:
      return {
        ...state,
        connecting: true,
        error: null
      };
    case WS_ACTIONS.CONNECT:
      return {
        ...state,
        connected: true,
        connecting: false,
        error: null
      };

    case WS_ACTIONS.DISCONNECT:
      return {
        ...state,
        connected: false,
        connecting: false,
        activeCall: null
      };

    case WS_ACTIONS.CALL_STARTED:
      const newCall = {
        id: action.payload.callUuid,
        phoneNumber: action.payload.phoneNumber,
        status: 'ringing',
        startTime: new Date(),
        agent: 'Shubhi',
        direction: action.payload.direction || 'inbound'
      };

      return {
        ...state,
        calls: [...state.calls, newCall],
        activeCall: newCall,
        metrics: {
          ...state.metrics,
          totalCalls: state.metrics.totalCalls + 1,
          activeCalls: state.metrics.activeCalls + 1
        }
      };

    case WS_ACTIONS.CALL_ENDED:
      return {
        ...state,
        calls: state.calls.map(call =>
          call.id === action.payload.callUuid
            ? { ...call, status: 'completed', endTime: new Date() }
            : call
        ),
        activeCall: state.activeCall?.id === action.payload.callUuid ? null : state.activeCall,
        metrics: {
          ...state.metrics,
          activeCalls: Math.max(0, state.metrics.activeCalls - 1)
        }
      };

    case WS_ACTIONS.TRANSCRIPT_UPDATED:
      return {
        ...state,
        transcripts: {
          ...state.transcripts,
          [action.payload.callUuid]: [
            ...(state.transcripts[action.payload.callUuid] || []),
            {
              timestamp: new Date(),
              speaker: action.payload.speaker,
              text: action.payload.text,
              confidence: action.payload.confidence
            }
          ]
        }
      };

    case WS_ACTIONS.AGENT_SPEAKING:
      return {
        ...state,
        activeCall: state.activeCall ? {
          ...state.activeCall,
          agentSpeaking: true,
          customerSpeaking: false
        } : null
      };

    case WS_ACTIONS.CUSTOMER_SPEAKING:
      return {
        ...state,
        activeCall: state.activeCall ? {
          ...state.activeCall,
          agentSpeaking: false,
          customerSpeaking: true
        } : null
      };

    case WS_ACTIONS.METRICS_UPDATED:
      return {
        ...state,
        metrics: {
          ...state.metrics,
          ...action.payload
        }
      };

    case WS_ACTIONS.ERROR:
      return {
        ...state,
        error: action.payload,
        connecting: false
      };

    default:
      return state;
  }
}

// WebSocket Provider Component
export function WebSocketProvider({ children }) {
  const [state, dispatch] = useReducer(wsReducer, initialState);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const pingIntervalRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 50;

  const resolveWsUrl = useCallback(() => {
    const base = process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
    let wsUrl = '';

    // Explicit logic for local dev vs production WS routing
    if (base.includes('localhost')) {
      wsUrl = 'ws://localhost:3000/monitor';
    } else {
      // In production (e.g., https://api.admin.com/api) stip /api
      const hostBase = base.replace(/\/api(\/v\d+)?$/i, '');
      wsUrl = hostBase.replace(/^http/, 'ws') + '/monitor';
    }

    return wsUrl;
  }, []);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    dispatch({ type: WS_ACTIONS.CONNECTING });

    const wsUrl = resolveWsUrl();

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        dispatch({ type: WS_ACTIONS.CONNECT });
        reconnectAttempts.current = 0;

        // Request initial state
        ws.send(JSON.stringify({ type: 'get_state' }));

        // Keep connection warm behind proxies and detect stale links.
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 15000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case 'call_started':
              dispatch({
                type: WS_ACTIONS.CALL_STARTED,
                payload: data.payload
              });
              break;

            case 'call_ended':
              dispatch({
                type: WS_ACTIONS.CALL_ENDED,
                payload: data.payload
              });
              break;

            case 'transcript':
              dispatch({
                type: WS_ACTIONS.TRANSCRIPT_UPDATED,
                payload: data.payload
              });
              break;

            case 'agent_speaking':
              dispatch({
                type: WS_ACTIONS.AGENT_SPEAKING
              });
              break;

            case 'customer_speaking':
              dispatch({
                type: WS_ACTIONS.CUSTOMER_SPEAKING
              });
              break;

            case 'metrics':
              dispatch({
                type: WS_ACTIONS.METRICS_UPDATED,
                payload: data.payload
              });
              break;

            case 'state':
              // Initial state sync
              dispatch({
                type: WS_ACTIONS.METRICS_UPDATED,
                payload: {
                  totalCalls: data.payload.totalCalls,
                  activeCalls: data.payload.activeCalls
                }
              });
              break;
            case 'pong':
              break;

            default:
              console.log('Unknown WebSocket message:', data);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        dispatch({ type: WS_ACTIONS.DISCONNECT });
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }

        // Attempt to reconnect
        if (reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);

          reconnectTimeoutRef.current = setTimeout(() => {
            console.log(`Reconnecting... Attempt ${reconnectAttempts.current}`);
            connect();
          }, delay);
        }
      };

      ws.onerror = (error) => {
        // Prevent noisy {} error logs if the socket was intentionally closed during React Strict Mode unmount
        if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) return;

        console.error('WebSocket connection error:', error?.message || 'Connection refused or dropped.');
        dispatch({
          type: WS_ACTIONS.ERROR,
          payload: 'WebSocket connection failed'
        });
      };

    } catch (error) {
      console.error('Failed to instantiate WebSocket:', error);
      dispatch({
        type: WS_ACTIONS.ERROR,
        payload: `Failed to connect: ${error.message}`
      });
    }
  }, [resolveWsUrl]);

  // Disconnect WebSocket
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    dispatch({ type: WS_ACTIONS.DISCONNECT });
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  const value = {
    ...state,
    connect,
    disconnect,
    wsRef: wsRef.current
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}

// Hook to use WebSocket context
export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}

// Hook for call-specific data
export function useCallData(callUuid) {
  const { calls, transcripts, activeCall } = useWebSocket();

  const call = calls.find(c => c.id === callUuid) || activeCall;
  const transcript = transcripts[callUuid] || [];

  return { call, transcript };
}

export { WS_ACTIONS };
