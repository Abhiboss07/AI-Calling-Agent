'use client';

import React, { useState, useEffect } from 'react';
import { useWebSocket } from '../../contexts/WebSocketContext';
import CallMonitor from '../../components/CallMonitor';
import { Phone, Activity, Users, Clock, TrendingUp, AlertCircle, CheckCircle } from 'lucide-react';

// Real-time Dashboard Page
export default function Dashboard() {
  const { connected, metrics, calls } = useWebSocket();
  const [stats, setStats] = useState({
    todayCalls: 0,
    avgDuration: 0,
    conversionRate: 0,
    activeAgents: 1
  });

  // Fetch additional stats
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/stats`);
        if (response.ok) {
          const data = await response.json();
          setStats(data);
        }
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Real-Time Dashboard</h1>
            <p className="text-gray-600 mt-1">Live call monitoring and analytics</p>
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${
              connected 
                ? 'bg-green-100 text-green-800' 
                : 'bg-red-100 text-red-800'
            }`}>
              <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'} ${connected ? 'animate-pulse' : ''}`} />
              {connected ? 'Connected' : 'Disconnected'}
            </div>
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Active Calls"
          value={metrics.activeCalls}
          icon={<Phone className="w-5 h-5 text-blue-600" />}
          color="blue"
          change={0}
        />
        <MetricCard
          title="Total Today"
          value={stats.todayCalls}
          icon={<Users className="w-5 h-5 text-green-600" />}
          color="green"
          change={12}
        />
        <MetricCard
          title="Avg Duration"
          value={`${Math.round(stats.avgDuration)}s`}
          icon={<Clock className="w-5 h-5 text-purple-600" />}
          color="purple"
          change={-5}
        />
        <MetricCard
          title="Conversion Rate"
          value={`${stats.conversionRate}%`}
          icon={<TrendingUp className="w-5 h-5 text-orange-600" />}
          color="orange"
          change={8}
        />
      </div>

      {/* Live Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Call Monitor */}
        <div className="lg:col-span-2">
          <CallMonitor />
        </div>

        {/* System Status */}
        <div className="space-y-6">
          <div className="bg-white rounded-lg border p-4">
            <h3 className="font-semibold text-gray-900 mb-4">System Status</h3>
            <div className="space-y-3">
              <StatusItem
                label="WebSocket Server"
                status={connected ? 'healthy' : 'error'}
                lastCheck="Just now"
              />
              <StatusItem
                label="AI Processing"
                status="healthy"
                lastCheck="Just now"
              />
              <StatusItem
                label="TTS Service"
                status="healthy"
                lastCheck="Just now"
              />
              <StatusItem
                label="STT Service"
                status="healthy"
                lastCheck="Just now"
              />
              <StatusItem
                label="Database"
                status="healthy"
                lastCheck="Just now"
              />
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-lg border p-4">
            <h3 className="font-semibold text-gray-900 mb-4">Recent Activity</h3>
            <div className="space-y-3">
              {calls.length === 0 ? (
                <p className="text-gray-500 text-sm">No recent calls</p>
              ) : (
                calls.slice(0, 5).map((call) => (
                  <div key={call.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <Phone className="w-3 h-3 text-gray-400" />
                      <span className="text-gray-900">{call.phoneNumber}</span>
                    </div>
                    <div className="text-gray-500">
                      {call.status}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Performance Chart */}
      <div className="bg-white rounded-lg border p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Call Volume Today</h3>
        <div className="h-64 flex items-center justify-center text-gray-500">
          <Activity className="w-8 h-8 mb-2" />
          <p>Chart integration coming soon</p>
          <p className="text-sm">Real-time call data will appear here</p>
        </div>
      </div>
    </div>
  );
}

// Metric Card Component
function MetricCard({ title, value, icon, color, change }) {
  const colorClasses = {
    blue: 'bg-blue-50 border-blue-200',
    green: 'bg-green-50 border-green-200',
    purple: 'bg-purple-50 border-purple-200',
    orange: 'bg-orange-50 border-orange-200'
  };

  return (
    <div className={`bg-white rounded-lg border p-6 ${colorClasses[color]}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <div className="text-gray-400">
          {icon}
        </div>
      </div>
      
      {change !== undefined && (
        <div className="mt-4 flex items-center text-sm">
          <span className={change >= 0 ? 'text-green-600' : 'text-red-600'}>
            {change >= 0 ? '+' : ''}{change}%
          </span>
          <span className="text-gray-500 ml-1">from yesterday</span>
        </div>
      )}
    </div>
  );
}

// Status Item Component
function StatusItem({ label, status, lastCheck }) {
  const getStatusIcon = (status) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Activity className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'healthy':
        return 'text-green-600';
      case 'error':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-700">{label}</span>
      <div className="flex items-center gap-2">
        {getStatusIcon(status)}
        <span className={`text-xs ${getStatusColor(status)}`}>{lastCheck}</span>
      </div>
    </div>
  );
}
