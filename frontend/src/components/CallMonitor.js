'use client';

import React, { useState, useEffect } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX, Clock, Users, Activity } from 'lucide-react';
import { useWebSocket, useCallData } from '../contexts/WebSocketContext';

// Real-time Call Monitoring Component
export default function CallMonitor() {
  const { connected, calls, activeCall, metrics, error } = useWebSocket();
  const [expandedCall, setExpandedCall] = useState(null);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center gap-2 text-red-600">
          <Activity className="w-5 h-5" />
          <span className="font-medium">Connection Error</span>
        </div>
        <p className="text-red-600 text-sm mt-1">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'} ${connected ? 'animate-pulse' : ''}`} />
            <span className="font-medium">
              {connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <div className="flex items-center gap-1">
              <Users className="w-4 h-4" />
              <span>{metrics.activeCalls} Active</span>
            </div>
            <div className="flex items-center gap-1">
              <Phone className="w-4 h-4" />
              <span>{metrics.totalCalls} Total</span>
            </div>
          </div>
        </div>
      </div>

      {/* Active Call */}
      {activeCall && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-blue-900">Active Call</h3>
            <div className="flex items-center gap-2">
              {activeCall.agentSpeaking && (
                <div className="flex items-center gap-1 text-blue-600">
                  <Volume2 className="w-4 h-4" />
                  <span className="text-sm">Agent Speaking</span>
                </div>
              )}
              {activeCall.customerSpeaking && (
                <div className="flex items-center gap-1 text-green-600">
                  <Mic className="w-4 h-4" />
                  <span className="text-sm">Customer Speaking</span>
                </div>
              )}
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Call ID</label>
              <p className="text-sm text-gray-900 font-mono">{activeCall.id}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Phone Number</label>
              <p className="text-sm text-gray-900">{activeCall.phoneNumber}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Duration</label>
              <p className="text-sm text-gray-900">
                <CallDuration startTime={activeCall.startTime} />
              </p>
            </div>
          </div>
          
          <div className="mt-3">
            <CallTranscript callUuid={activeCall.id} />
          </div>
        </div>
      )}

      {/* Recent Calls */}
      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b">
          <h3 className="font-semibold">Recent Calls</h3>
        </div>
        
        {calls.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Phone className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>No calls yet</p>
            <p className="text-sm">Calls will appear here in real-time</p>
          </div>
        ) : (
          <div className="divide-y">
            {calls.map((call) => (
              <CallItem 
                key={call.id} 
                call={call} 
                isExpanded={expandedCall === call.id}
                onToggle={() => setExpandedCall(expandedCall === call.id ? null : call.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Individual Call Item
function CallItem({ call, isExpanded, onToggle }) {
  const { transcript } = useCallData(call.id);
  
  const getStatusColor = (status) => {
    switch (status) {
      case 'ringing': return 'text-yellow-600 bg-yellow-50';
      case 'in-progress': return 'text-green-600 bg-green-50';
      case 'completed': return 'text-gray-600 bg-gray-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'ringing': return <Phone className="w-4 h-4" />;
      case 'in-progress': return <Phone className="w-4 h-4" />;
      case 'completed': return <PhoneOff className="w-4 h-4" />;
      default: return <Phone className="w-4 h-4" />;
    }
  };

  return (
    <div className="p-4 hover:bg-gray-50 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-full ${getStatusColor(call.status)}`}>
            {getStatusIcon(call.status)}
          </div>
          <div>
            <p className="font-medium">{call.phoneNumber}</p>
            <p className="text-sm text-gray-600">
              {call.direction === 'inbound' ? 'Incoming' : 'Outgoing'} • {call.agent}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-medium">{call.status}</p>
            <p className="text-xs text-gray-500">
              {call.startTime && <CallDuration startTime={call.startTime} />}
            </p>
          </div>
          
          <button
            onClick={onToggle}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <Activity className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>
      
      {isExpanded && (
        <div className="mt-4 pt-4 border-t">
          <CallTranscript callUuid={call.id} />
        </div>
      )}
    </div>
  );
}

// Call Duration Component
function CallDuration({ startTime }) {
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (!startTime) return;

    const interval = setInterval(() => {
      const now = new Date();
      const diff = now - new Date(startTime);
      const seconds = Math.floor(diff / 1000);
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      
      setDuration(`${minutes}:${remainingSeconds.toString().padStart(2, '0')}`);
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime]);

  return duration || '0:00';
}

// Call Transcript Component
function CallTranscript({ callUuid }) {
  const { transcript } = useCallData(callUuid);

  if (transcript.length === 0) {
    return (
      <div className="text-center text-gray-500 py-4">
        <MicOff className="w-8 h-8 mx-auto mb-2 text-gray-300" />
        <p className="text-sm">No transcript yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-60 overflow-y-auto">
      {transcript.map((entry, index) => (
        <div key={index} className="flex gap-3 text-sm">
          <div className={`flex-shrink-0 w-20 text-right ${
            entry.speaker === 'agent' ? 'text-blue-600' : 'text-green-600'
          }`}>
            {entry.speaker === 'agent' ? 'Shubhi' : 'Customer'}
          </div>
          <div className="flex-1">
            <p className="text-gray-900">{entry.text}</p>
            {entry.confidence && (
              <p className="text-xs text-gray-500">
                Confidence: {Math.round(entry.confidence * 100)}%
              </p>
            )}
          </div>
          <div className="flex-shrink-0 text-xs text-gray-400">
            {new Date(entry.timestamp).toLocaleTimeString()}
          </div>
        </div>
      ))}
    </div>
  );
}
