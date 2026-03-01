import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import AuthProvider from "@/components/AuthProvider";
import { WebSocketProvider } from "@/contexts/WebSocketContext";
import { ThemeProvider } from "@/contexts/ThemeContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "AI Calling Agent — Dashboard",
  description: "AI-powered calling agent dashboard for managing outbound calls, leads, and voice campaigns",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider>
          <AuthProvider>
            <WebSocketProvider>
              <div className="layout-container">
                <Sidebar />
                <div className="layout-body">
                  <TopBar />
                  <main style={{ 
                    flex: 1, 
                    padding: '32px', 
                    overflowY: 'auto', 
                    background: 'var(--bg-primary)',
                    marginLeft: 'var(--sidebar-width)'
                  }}>{children}</main>
                </div>
              </div>
            </WebSocketProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
