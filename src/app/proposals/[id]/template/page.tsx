"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, X, HelpCircle, FileText, Plus } from "lucide-react";

export default function TemplateSelectionPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'type' | 'industry'>('type');
  const [activeCategory, setActiveCategory] = useState('All Templates');
  const [searchQuery, setSearchQuery] = useState('consulting');

  const categories = [
    { name: 'All Templates', count: 8 },
    { name: 'Consulting', count: 7 },
    { name: 'Marketing', count: 1 },
  ];

  const templates = [
    { id: 'blank', title: 'Blank Proposal', type: 'blank', actionText: 'Start from scratch', image: null },
    { id: 'creative', title: 'Creative Agency', type: 'template', actionText: 'Use Template', image: 'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=600&auto=format&fit=crop&q=80' },
    { id: 'minimalist', title: 'Minimalist Studio', type: 'template', actionText: 'Use Template', image: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=600&auto=format&fit=crop&q=80' },
    { id: 'corporate', title: 'Corporate Consulting', type: 'template', actionText: 'Use Template', image: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=600&auto=format&fit=crop&q=80' },
    { id: 'tech', title: 'Tech Startup', type: 'template', actionText: 'Use Template', image: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=600&auto=format&fit=crop&q=80' },
    { id: 'marketing', title: 'Marketing Campaign', type: 'template', actionText: 'Use Template', image: 'https://images.unsplash.com/photo-1557682250-33bd709cbe85?w=600&auto=format&fit=crop&q=80' },
  ];

  const handleSelectTemplate = (templateId: string) => {
    // Pass the selected template via URL query parameter
    router.push(`/proposals/${params.id}/edit?template=${templateId}`);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans relative">
      
      {/* Top right close button */}
      <div className="absolute top-6 right-6 z-10">
        <Link href="/proposals" className="p-2 text-gray-400 hover:text-gray-600 transition-colors flex">
          <X className="w-6 h-6" />
        </Link>
      </div>

      <div className="flex flex-1 max-w-[1400px] mx-auto w-full pt-20 px-8 pb-12 gap-16">
        
        {/* Left Sidebar - Filters */}
        <div className="w-[280px] shrink-0">
          <h1 className="text-[28px] font-bold text-gray-900 mb-3 tracking-tight">Select a Template</h1>
          <p className="text-gray-600 mb-8 leading-relaxed text-[15px]">
            Get a headstart with one of our customizable templates.
          </p>

          <div className="flex border-b border-gray-200 mb-4">
            <button 
              onClick={() => setActiveTab('type')}
              className={`flex-1 pb-3 text-sm font-semibold transition-colors relative ${activeTab === 'type' ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
            >
              Type
              {activeTab === 'type' && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gray-900"></div>}
            </button>
            <button 
              onClick={() => setActiveTab('industry')}
              className={`flex-1 pb-3 text-sm font-semibold transition-colors relative ${activeTab === 'industry' ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
            >
              Industry
              {activeTab === 'industry' && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gray-900"></div>}
            </button>
          </div>

          <div className="space-y-1">
            {categories.map((cat) => (
              <button
                key={cat.name}
                onClick={() => setActiveCategory(cat.name)}
                className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  activeCategory === cat.name 
                    ? 'bg-[#EEF2F6] text-gray-900' 
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span>{cat.name}</span>
                <span>{cat.count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col">
          
          {/* Search Bar */}
          <div className="relative mb-10">
            <Search className="w-4 h-4 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-11 py-3 bg-white border border-[#22c55e] rounded-lg text-[15px] focus:outline-none focus:ring-1 focus:ring-[#22c55e] font-medium text-gray-900 shadow-sm"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
            {templates.map((template) => (
              <div key={template.id} className="flex flex-col group cursor-pointer" onClick={() => handleSelectTemplate(template.id)}>
                <div className="bg-white border border-gray-100 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow aspect-[1/1.2] mb-4 flex flex-col relative">
                  {template.type === 'blank' ? (
                    <div className="flex-1 p-8 bg-white flex flex-col items-center justify-center border-2 border-dashed border-gray-200 m-4 rounded-xl">
                       <Plus className="w-8 h-8 text-gray-300 mb-3" />
                       <div className="text-gray-400 font-medium text-sm">Create Custom</div>
                    </div>
                  ) : (
                    <div className="flex-1 bg-gray-50 flex flex-col relative overflow-hidden">
                      <div className="absolute inset-0">
                        <img src={template.image!} alt={template.title} className="w-full h-full object-cover opacity-90 group-hover:scale-105 transition-transform duration-700" />
                      </div>
                      
                      {/* Gradient overlay to make text pop */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>

                      {/* Mocked Document Overlay */}
                      <div className="absolute bottom-0 left-0 right-0 p-6 flex flex-col justify-end">
                         <div className="bg-white/95 backdrop-blur-sm p-4 rounded-lg shadow-lg border border-white/20 transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
                            <div className="font-bold text-gray-900 mb-1">{template.title}</div>
                            <div className="flex items-center gap-2 text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
                               <span>Proposal Template</span>
                            </div>
                         </div>
                      </div>
                    </div>
                  )}
                  {/* Overlay on hover */}
                  <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                </div>
                
                <div className="text-center">
                  <h3 className="font-bold text-gray-900 text-sm mb-1">{template.title}</h3>
                  <button className="text-[#22c55e] font-semibold text-sm hover:text-green-600 transition-colors">
                    {template.actionText}
                  </button>
                </div>
              </div>
            ))}
          </div>

        </div>

      </div>

      {/* Bottom Right Help Button */}
      <button className="fixed bottom-6 right-6 w-12 h-12 bg-white border border-gray-200 shadow-lg rounded-full flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors z-10">
        <HelpCircle className="w-6 h-6" />
      </button>

    </div>
  );
}
