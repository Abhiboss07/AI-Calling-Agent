'use client';

export default function TopBar() {
    return (
        <header className="sticky top-0 z-10 glass border-b border-slate-800/50 px-8 py-4 flex items-center justify-between">
            {/* Search */}
            <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-slate-400">search</span>
                <input
                    className="bg-transparent border-none focus:ring-0 text-sm text-slate-300 w-64 placeholder:text-slate-500"
                    placeholder="Search leads or recordings..."
                    type="text"
                />
            </div>

            {/* Right Section */}
            <div className="flex items-center gap-6">
                <div className="flex items-center gap-4 border-r border-slate-800 pr-6">
                    <button className="relative text-slate-400 hover:text-slate-100">
                        <span className="material-symbols-outlined">notifications</span>
                        <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full border-2 border-background-dark"></span>
                    </button>
                    <button className="text-slate-400 hover:text-slate-100">
                        <span className="material-symbols-outlined">chat_bubble</span>
                    </button>
                </div>

                {/* User Profile */}
                <div className="flex items-center gap-3">
                    <div className="text-right">
                        <p className="text-sm font-semibold text-slate-100 leading-none">Admin</p>
                        <p className="text-xs text-slate-500 mt-1">Admin Account</p>
                    </div>
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center text-white font-bold border-2 border-slate-800">
                        A
                    </div>
                </div>
            </div>
        </header>
    );
}
