'use client';

export default function KnowledgeBasePage() {
    return (
        <div className="flex flex-1 overflow-hidden h-full">
            {/* Left Sidebar: Actions & Controls */}
            <aside className="w-64 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-background-dark p-6 flex flex-col gap-8">
                <div>
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Ingestion</h3>
                    <div className="space-y-2">
                        <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-primary text-white font-medium text-sm transition-all hover:bg-primary/90 shadow-lg shadow-primary/20">
                            <span className="material-symbols-outlined text-sm">upload_file</span>
                            Upload PDFs
                        </button>
                        <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">
                            <span className="material-symbols-outlined text-sm">link</span>
                            Sync Website URL
                        </button>
                    </div>
                </div>
                <div>
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Categories</h3>
                    <nav className="space-y-1">
                        <a className="flex items-center justify-between px-3 py-2 rounded-lg bg-primary/10 text-primary font-medium text-sm" href="#">
                            <div className="flex items-center gap-3">
                                <span className="material-symbols-outlined text-sm">folder</span>
                                All Documents
                            </div>
                            <span className="text-[10px] bg-primary/20 px-2 py-0.5 rounded-full">24</span>
                        </a>
                        <a className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm" href="#">
                            <span className="material-symbols-outlined text-sm">home_work</span>
                            Property Listings
                        </a>
                        <a className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm" href="#">
                            <span className="material-symbols-outlined text-sm">description</span>
                            Scripts &amp; FAQs
                        </a>
                        <a className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm" href="#">
                            <span className="material-symbols-outlined text-sm">gavel</span>
                            Legal &amp; Contracts
                        </a>
                    </nav>
                </div>
                <div className="mt-auto">
                    <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Storage Usage</p>
                        <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mb-2">
                            <div className="w-3/4 h-full bg-primary rounded-full"></div>
                        </div>
                        <p className="text-[10px] text-slate-500 font-medium">750MB / 1GB (75%)</p>
                    </div>
                </div>
            </aside>

            {/* Main Content: Document List */}
            <main className="flex-1 overflow-y-auto p-8 bg-background-light dark:bg-background-dark">
                <div className="max-w-5xl mx-auto">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Learned Documents</h1>
                            <p className="text-slate-500 dark:text-slate-400 text-sm">Manage the resources your AI agent uses to answer client inquiries.</p>
                        </div>
                        <div className="flex gap-2">
                            <button className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                                <span className="material-symbols-outlined">grid_view</span>
                            </button>
                            <button className="p-2 text-primary font-bold">
                                <span className="material-symbols-outlined">view_list</span>
                            </button>
                        </div>
                    </div>

                    {/* Table Container */}
                    <div className="bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Document Name</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Added On</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {/* Document Row 1 */}
                                <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-10 bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded flex items-center justify-center">
                                                <span className="material-symbols-outlined text-lg">picture_as_pdf</span>
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Oceanview_Penthouse_Listing.pdf</p>
                                                <p className="text-xs text-slate-400">1.2 MB • 4 pages</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-xs px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">Listing</span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Ready</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-slate-500">Oct 24, 2023</td>
                                    <td className="px-6 py-4 text-right">
                                        <button className="text-slate-400 hover:text-primary transition-colors">
                                            <span className="material-symbols-outlined">more_horiz</span>
                                        </button>
                                    </td>
                                </tr>
                                {/* Document Row 2 */}
                                <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-10 bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded flex items-center justify-center">
                                                <span className="material-symbols-outlined text-lg">language</span>
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">https://realestate.com/faq-section</p>
                                                <p className="text-xs text-slate-400">Scraped 12 pages</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-xs px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">Website URL</span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                                            <span className="text-xs font-medium text-primary">Processing...</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-slate-500">Just now</td>
                                    <td className="px-6 py-4 text-right">
                                        <button className="text-slate-400 hover:text-primary transition-colors">
                                            <span className="material-symbols-outlined">more_horiz</span>
                                        </button>
                                    </td>
                                </tr>
                                {/* Document Row 3 */}
                                <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-10 bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded flex items-center justify-center">
                                                <span className="material-symbols-outlined text-lg">article</span>
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">First_Time_Buyer_Script.docx</p>
                                                <p className="text-xs text-slate-400">45 KB • 2 pages</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-xs px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">Script</span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Ready</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-slate-500">Oct 20, 2023</td>
                                    <td className="px-6 py-4 text-right">
                                        <button className="text-slate-400 hover:text-primary transition-colors">
                                            <span className="material-symbols-outlined">more_horiz</span>
                                        </button>
                                    </td>
                                </tr>
                                {/* Document Row 4 */}
                                <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-10 bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded flex items-center justify-center">
                                                <span className="material-symbols-outlined text-lg">picture_as_pdf</span>
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Mortgage_Rates_2024.pdf</p>
                                                <p className="text-xs text-slate-400">2.4 MB • 15 pages</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-xs px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">Finance</span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                                            <span className="text-xs font-medium text-slate-500">Paused</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-slate-500">Oct 18, 2023</td>
                                    <td className="px-6 py-4 text-right">
                                        <button className="text-slate-400 hover:text-primary transition-colors">
                                            <span className="material-symbols-outlined">more_horiz</span>
                                        </button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                            <p className="text-xs text-slate-500">Showing 4 of 24 documents</p>
                            <div className="flex gap-1">
                                <button className="p-2 border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                                    <span className="material-symbols-outlined text-xs">chevron_left</span>
                                </button>
                                <button className="p-2 border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                                    <span className="material-symbols-outlined text-xs">chevron_right</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            {/* Right Sidebar: Test Chat */}
            <aside className="w-80 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-background-dark flex flex-col overflow-hidden">
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30">
                    <div className="flex items-center justify-between mb-1">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Test Knowledge</h3>
                        <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded uppercase">Live</span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Verify what the AI knows about your uploaded documents.</p>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* Message from AI */}
                    <div className="flex flex-col gap-1.5 max-w-[90%]">
                        <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-xl rounded-tl-none">
                            <p className="text-xs text-slate-700 dark:text-slate-300">Hi! I&apos;ve processed your latest listings. You can ask me anything about the Oceanview Penthouse or buyer scripts.</p>
                        </div>
                        <p className="text-[10px] text-slate-400 ml-1">AI Agent • 10:24 AM</p>
                    </div>
                    {/* Message from User */}
                    <div className="flex flex-col gap-1.5 items-end max-w-[90%] ml-auto">
                        <div className="bg-primary text-white p-3 rounded-xl rounded-tr-none">
                            <p className="text-xs">How many bedrooms are in the Oceanview Penthouse?</p>
                        </div>
                        <p className="text-[10px] text-slate-400 mr-1">You • 10:25 AM</p>
                    </div>
                    {/* Message from AI with Source */}
                    <div className="flex flex-col gap-1.5 max-w-[90%]">
                        <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-xl rounded-tl-none border-l-2 border-primary">
                            <p className="text-xs text-slate-700 dark:text-slate-300">The Oceanview Penthouse listing specifies 4 bedrooms and 4.5 bathrooms, including a primary suite with floor-to-ceiling glass walls.</p>
                            <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                                <p className="text-[10px] text-primary font-bold uppercase flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[12px]">source</span>
                                    Source: Oceanview_Penthouse_Listing.pdf
                                </p>
                            </div>
                        </div>
                        <p className="text-[10px] text-slate-400 ml-1">AI Agent • 10:25 AM</p>
                    </div>
                </div>
                {/* Input Area */}
                <div className="p-4 border-t border-slate-200 dark:border-slate-800">
                    <div className="relative">
                        <textarea className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg text-xs py-3 pl-3 pr-10 resize-none focus:ring-primary focus:border-primary" placeholder="Ask a question..." rows="2"></textarea>
                        <button className="absolute right-2 bottom-2 p-1.5 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors">
                            <span className="material-symbols-outlined text-sm leading-none">send</span>
                        </button>
                    </div>
                    <div className="flex items-center justify-between mt-3 px-1">
                        <div className="flex gap-2">
                            <button className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                                <span className="material-symbols-outlined text-sm">mic</span>
                            </button>
                            <button className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                                <span className="material-symbols-outlined text-sm">settings_voice</span>
                            </button>
                        </div>
                        <button className="text-[10px] font-bold text-slate-400 uppercase hover:text-primary transition-colors">Reset Chat</button>
                    </div>
                </div>
            </aside>
        </div>
    );
}
