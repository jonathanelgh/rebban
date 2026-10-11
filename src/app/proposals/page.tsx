"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { 
  Plus, Search, FileText, CheckCircle2, Clock, XCircle, Eye, 
  X, ChevronRight, DollarSign, ChevronDown, Check, Building2,
  Sparkles, PenTool, UploadCloud, Paperclip
} from "lucide-react";

export default function ProposalsPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <main className="w-full p-8 pb-32 pt-10 max-w-5xl mx-auto relative">
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">Proposals</h1>
          <p className="text-gray-500 mt-1.5 text-[15px]">From brief to acceptance — then deposit invoice.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-[#3B82F6] hover:bg-blue-600 text-white px-5 py-2.5 rounded-full text-sm font-medium transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New Proposal
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-8">
        <StatCard label="Active" value="4" accent="bg-[#F5F8FF]" />
        <StatCard label="Awaiting" value="2" hint="Need follow-up" accent="bg-[#FFF9D6]" />
        <StatCard label="Accepted" value="5" hint="This month" accent="bg-[#F3FAF6]" />
        <StatCard label="Win rate" value="83%" accent="bg-white" />
      </div>

      <div className="flex items-center justify-between mb-5">
        <div className="relative w-72">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input 
            type="text" 
            placeholder="Search proposals..." 
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#EEF0F3] rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <div className="flex gap-2">
          <button className="pill-filter">All statuses</button>
          <button className="pill-filter">This month</button>
        </div>
      </div>

      <div className="surface-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-gray-400 font-medium">
              <tr className="border-b border-[#EEF0F3]">
                <th className="px-6 py-3 font-medium">Client / Project</th>
                <th className="px-6 py-3 font-medium">Value</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Sent</th>
                <th className="px-6 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              <ProposalRow 
                client="Acme Corp" 
                project="Website Redesign 2027"
                value="$15,000.00" 
                status="Viewed" 
                sentDate="Oct 06"
                action="Follow up"
              />
              <ProposalRow 
                client="Globex Inc" 
                project="Brand Identity Package"
                value="$8,500.00" 
                status="Draft" 
                sentDate="—"
                action="Edit"
              />
              <ProposalRow 
                client="Stark Industries" 
                project="Q4 Marketing Strategy"
                value="$22,000.00" 
                status="Accepted" 
                sentDate="Oct 01"
                action="Convert to Invoice"
              />
              <ProposalRow 
                client="Wayne Enterprises" 
                project="E-commerce Migration"
                value="$35,000.00" 
                status="Declined" 
                sentDate="Sep 15"
                action="View Reason"
              />
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && <CreateProposalModal onClose={() => setIsModalOpen(false)} />}
    </main>
  );
}

function StatCard({ label, value, hint, accent = "bg-white" }: { label: string, value: string, hint?: string, accent?: string }) {
  return (
    <div className={`${accent} border border-[#EEF0F3] rounded-[1.25rem] p-5`}>
      <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</span>
      <h3 className="text-2xl font-semibold tracking-tight text-gray-900 mt-2">{value}</h3>
      {hint && <p className="text-xs mt-1.5 text-gray-400">{hint}</p>}
    </div>
  );
}

function ProposalRow({ client, project, value, status, sentDate, action }: { client: string, project: string, value: string, status: string, sentDate: string, action: string }) {
  const getStatusBadge = (s: string) => {
    switch(s.toLowerCase()) {
      case 'accepted': return <Badge label={s} type="green" icon={<CheckCircle2 className="w-3 h-3" />} />;
      case 'viewed': return <Badge label={s} type="blue" icon={<Eye className="w-3 h-3" />} />;
      case 'draft': return <Badge label={s} type="gray" icon={<FileText className="w-3 h-3" />} />;
      case 'declined': return <Badge label={s} type="red" icon={<XCircle className="w-3 h-3" />} />;
      default: return <Badge label={s} type="gray" />;
    }
  }

  return (
    <tr className="border-b border-[#EEF0F3] last:border-0 hover:bg-[#FAFBFC] transition-colors cursor-pointer">
      <td className="px-6 py-4">
        <div className="font-medium text-gray-900">{client}</div>
        <div className="text-xs text-gray-400 mt-0.5">{project}</div>
      </td>
      <td className="px-6 py-4 font-medium">{value}</td>
      <td className="px-6 py-4">{getStatusBadge(status)}</td>
      <td className="px-6 py-4 text-gray-400">{sentDate}</td>
      <td className="px-6 py-4 text-right">
        {action === 'Convert to Invoice' ? (
          <button className="text-sm font-medium text-emerald-600 hover:text-emerald-800 transition-colors">Convert to Invoice</button>
        ) : action === 'Follow up' ? (
          <button className="text-sm font-medium text-[#3B82F6] hover:text-blue-700 transition-colors">Follow up</button>
        ) : (
          <button className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors">{action}</button>
        )}
      </td>
    </tr>
  );
}

/* =========================================================
   Custom Searchable Client Dropdown
   ========================================================= */

function ClientSelectDropdown({ 
  selected, 
  onChange, 
  onCreateNew 
}: { 
  selected: {name: string, company?: string} | null, 
  onChange: (client: {name: string, company?: string}) => void,
  onCreateNew: () => void
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Mock data matching the screenshot
  const clients = [
    { name: "Acme Studio", company: "Acme Corp" },
    { name: "Globex Inc", company: "Globex LLC" },
    { name: "Stark Industries", company: "Stark Inc" }
  ];

  const filtered = clients.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    (c.company && c.company.toLowerCase().includes(search.toLowerCase()))
  );

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-100 outline-none bg-white text-left"
      >
        <span className={selected ? "text-gray-900" : "text-gray-400"}>
          {selected ? selected.name : "Select a client..."}
        </span>
        <ChevronDown className="w-4 h-4 text-gray-400" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-[340px] bg-white rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] border border-gray-100 overflow-hidden z-50">
          
          {/* Search Bar matching screenshot */}
          <div className="p-3 border-b border-gray-50 flex items-center gap-2">
            <Search className="w-4 h-4 text-gray-400 shrink-0 ml-1" />
            <input 
              type="text"
              autoFocus
              placeholder="Search clients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-sm outline-none placeholder-gray-400 font-medium"
            />
          </div>

          <div className="max-h-[240px] overflow-y-auto p-2 space-y-1 custom-scrollbar">
            {filtered.length > 0 ? (
              filtered.map((client, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    onChange(client);
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center justify-between p-2 hover:bg-gray-50 rounded-xl transition-colors text-left group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-50 text-[#3B82F6] flex items-center justify-center font-bold text-xs shrink-0">
                      {client.name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900">{client.name}</div>
                      <div className="text-xs text-gray-500">{client.company}</div>
                    </div>
                  </div>
                  {selected?.name === client.name && (
                    <Check className="w-4 h-4 text-[#3B82F6]" />
                  )}
                </button>
              ))
            ) : (
              <div className="p-4 text-center text-sm text-gray-500">No clients found.</div>
            )}
          </div>

          {/* Sticky Create New Button */}
          <div className="p-2 border-t border-gray-50 bg-gray-50/50">
            <button
              onClick={() => {
                setIsOpen(false);
                onCreateNew();
              }}
              className="w-full flex items-center gap-2 p-2.5 text-sm font-medium text-[#3B82F6] hover:bg-blue-50 rounded-xl transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create new client
            </button>
          </div>

        </div>
      )}
    </div>
  );
}

/* =========================================================
   Create New Client Modal
   ========================================================= */

function CreateClientModal({ onClose, onSave }: { onClose: () => void, onSave: (client: {name: string, company?: string}) => void }) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");

  const handleSave = () => {
    if (name) {
      onSave({ name, company });
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-[2rem] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.15)] w-full max-w-[500px] flex flex-col overflow-hidden">
        
        <div className="px-8 pt-8 pb-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-50 text-[#3B82F6] flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">Add New Client</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Primary Contact Name *</label>
            <input 
              autoFocus
              type="text" 
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Jane Doe"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-100 outline-none" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Company Name (Optional)</label>
            <input 
              type="text" 
              value={company}
              onChange={e => setCompany(e.target.value)}
              placeholder="e.g. Acme Studio LLC"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-100 outline-none" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Email Address *</label>
            <input 
              type="email" 
              placeholder="jane@acmestudio.com"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-100 outline-none" 
            />
          </div>
        </div>

        <div className="px-8 py-5 border-t border-gray-100 flex items-center justify-end bg-gray-50/50 gap-3">
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-200 transition-colors">
            Cancel
          </button>
          <button 
            onClick={handleSave}
            disabled={!name}
            className="bg-[#3B82F6] hover:bg-blue-600 disabled:opacity-50 disabled:hover:bg-[#3B82F6] text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm"
          >
            Save Client
          </button>
        </div>

      </div>
    </div>
  );
}

function Badge({ label, type, icon }: { label: string, type: string, icon?: React.ReactNode }) {
  const styles: Record<string, string> = {
    red: "bg-red-50 text-red-600",
    blue: "bg-[#EAF3FF] text-[#3B82F6]",
    green: "bg-emerald-50 text-emerald-700",
    gray: "bg-gray-50 text-gray-500",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-2.5 py-0.5 ${styles[type] || styles.gray}`}>
      {icon}
      {label}
    </span>
  );
}

/* =========================================================
   Lightweight Create Proposal Modal
   ========================================================= */

function CreateProposalModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [creationMode, setCreationMode] = useState<'scratch' | 'ai'>('scratch');
  const [pricingModel, setPricingModel] = useState("Fixed");
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<{name: string, company?: string} | null>(null);

  const [aiText, setAiText] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    const chatBar = document.getElementById('global-chat-bar');
    if (chatBar) {
      chatBar.style.opacity = '0';
      chatBar.style.transform = 'translate(-50%, 20px)';
      chatBar.style.visibility = 'hidden';
    }
    return () => {
      if (chatBar) {
        chatBar.style.opacity = '';
        chatBar.style.transform = '';
        chatBar.style.visibility = '';
      }
    };
  }, []);

  const handleContinue = () => {
    // Route to the new Template Selection step before entering the canvas
    router.push("/proposals/draft-123/template");
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-[2rem] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.15)] w-full max-w-[600px] flex flex-col overflow-hidden relative">
        
        {/* Header */}
        <div className="px-8 pt-8 pb-4 border-b border-gray-100 shrink-0 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Create New Proposal</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-8 space-y-6">

          {/* Creation Mode Toggle */}
          <div>
            <div className="flex p-1 bg-gray-100 rounded-xl mb-6">
              <button 
                onClick={() => setCreationMode('scratch')}
                className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 ${creationMode === 'scratch' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <PenTool className="w-4 h-4" />
                Start from scratch
              </button>
              <button 
                onClick={() => setCreationMode('ai')}
                className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 ${creationMode === 'ai' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <Sparkles className="w-4 h-4" />
                Generate with AI
              </button>
            </div>
          </div>

          {creationMode === 'ai' ? (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="relative z-10">
                <label className="block text-sm font-medium text-gray-700 mb-2">Client</label>
                <ClientSelectDropdown 
                  selected={selectedClient} 
                  onChange={setSelectedClient} 
                  onCreateNew={() => setIsClientModalOpen(true)}
                />
              </div>

              <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-5 relative z-0">
                <div className="flex items-start gap-3 text-sm text-gray-600 mb-4">
                  <Sparkles className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                  <p>Upload a brief, paste client emails, or drop notes below. AI will automatically structure your proposal's scope, timeline, and deliverables.</p>
                </div>
                
                {/* File Upload Area */}
                <div 
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${isUploading ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/30 bg-white'}`}
                  onClick={() => setIsUploading(true)}
                >
                  {isUploading ? (
                    <div className="flex items-center justify-center gap-2 text-blue-600 font-medium text-sm">
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                      Processing documents...
                    </div>
                  ) : (
                    <>
                      <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-3 text-blue-500">
                        <UploadCloud className="w-5 h-5" />
                      </div>
                      <div className="text-sm font-medium text-gray-900 mb-1">Click to upload documents</div>
                      <div className="text-xs text-gray-500">PDF, DOCX, TXT up to 10MB</div>
                    </>
                  )}
                </div>

                <div className="relative mt-4">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200"></div></div>
                  <div className="relative flex justify-center text-xs"><span className="bg-blue-50 px-2 text-gray-400">OR PASTE TEXT</span></div>
                </div>

                <textarea
                  value={aiText}
                  onChange={(e) => setAiText(e.target.value)}
                  placeholder="Paste client emails, call notes, or project requirements here..."
                  className="w-full mt-4 bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-100 outline-none resize-none min-h-[120px]"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="grid grid-cols-2 gap-6 relative z-10">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Client</label>
                  <ClientSelectDropdown 
                    selected={selectedClient} 
                    onChange={setSelectedClient} 
                    onCreateNew={() => setIsClientModalOpen(true)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Project Category</label>
                  <select className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-100 outline-none appearance-none bg-white">
                    <option>Web Design</option>
                    <option>Development</option>
                    <option>Marketing</option>
                    <option>Consulting</option>
                  </select>
                </div>
              </div>

              <div className="relative z-0">
                <label className="block text-sm font-medium text-gray-700 mb-2">Proposal Title</label>
                <input 
                  type="text" 
                  placeholder="e.g. Website Redesign & Build"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-100 outline-none" 
                />
              </div>

              <div className="relative z-0">
                <label className="block text-sm font-medium text-gray-700 mb-3">Pricing Model</label>
                <div className="flex p-1 bg-gray-100 rounded-xl">
                  {['Fixed', 'Hourly', 'Retainer'].map(model => (
                    <button 
                      key={model}
                      onClick={() => setPricingModel(model)}
                      className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${pricingModel === model ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      {model}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 relative z-0">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Currency</label>
                  <select className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-100 outline-none appearance-none bg-white">
                    <option>USD ($)</option>
                    <option>EUR (€)</option>
                    <option>GBP (£)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Estimated Value (Optional)</label>
                  <div className="relative">
                    <DollarSign className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input 
                      type="text" 
                      placeholder="0.00" 
                      className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-3 text-sm focus:ring-2 focus:ring-blue-100 outline-none" 
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="px-8 py-5 border-t border-gray-100 flex items-center justify-end bg-gray-50/50 shrink-0 gap-3 relative z-0">
          <button 
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleContinue}
            className="bg-[#3B82F6] hover:bg-blue-600 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
          >
            {creationMode === 'ai' ? (
              <>Generate Proposal <Sparkles className="w-4 h-4 fill-current" /></>
            ) : (
              <>Create Draft & Continue <ChevronRight className="w-4 h-4" /></>
            )}
          </button>
        </div>

      </div>

      {isClientModalOpen && (
        <CreateClientModal 
          onClose={() => setIsClientModalOpen(false)} 
          onSave={(client) => {
            setSelectedClient(client);
            setIsClientModalOpen(false);
          }} 
        />
      )}
    </div>
  );
}
