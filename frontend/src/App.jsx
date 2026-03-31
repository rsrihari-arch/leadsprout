import { useState, useRef, useEffect, useMemo, useCallback } from "react";

const API = "/api";

function CompanySearch({ query, setQuery, onSelect }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const wrapperRef = useRef(null);
  const abortRef = useRef(null);

  const fetchSuggestions = useCallback(async (q) => {
    if (!q || q.length < 2) { setSuggestions([]); setOpen(false); return; }
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch(
        `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(q)}`,
        { signal: controller.signal }
      );
      const data = await res.json();
      setSuggestions(data.slice(0, 8));
      setOpen(data.length > 0);
      setHighlighted(-1);
    } catch {}
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => fetchSuggestions(query), 150);
    return () => clearTimeout(timer);
  }, [query, fetchSuggestions]);

  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const select = (company) => {
    setQuery(company.name);
    setOpen(false);
    onSelect(company);
  };

  const handleKeyDown = (e) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlighted((h) => Math.min(h + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlighted((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter" && highlighted >= 0) { e.preventDefault(); select(suggestions[highlighted]); }
    else if (e.key === "Escape") setOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative flex-1">
      <input
        type="text"
        placeholder="Type to search any company..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          handleKeyDown(e);
          if (e.key === "Enter" && highlighted < 0) onSelect(null);
        }}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition"
      />
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-80 overflow-y-auto">
          {suggestions.map((c, i) => (
            <button
              key={c.domain}
              onClick={() => select(c)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition ${
                i === highlighted ? "bg-green-50" : "hover:bg-gray-50"
              } ${i > 0 ? "border-t border-gray-100" : ""}`}
            >
              <img
                src={`${API}/logo/${c.domain}`}
                alt=""
                className="w-8 h-8 rounded-lg bg-gray-100 object-contain flex-shrink-0"
                onError={(e) => { e.target.style.display = "none"; }}
              />
              <div className="min-w-0">
                <div className="font-medium text-gray-900 truncate">{c.name}</div>
                <div className="text-xs text-gray-400 truncate">{c.domain}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const LEVEL_COLORS = {
  CXO: "text-red-600",
  VP: "text-purple-600",
  DIR: "text-blue-600",
  MGR: "text-green-600",
  IC: "text-gray-500",
};

const LEVEL_DOTS = {
  CXO: "bg-red-500",
  VP: "bg-purple-500",
  DIR: "bg-blue-500",
  MGR: "bg-green-500",
};

function ScoreBadge({ score }) {
  if (!score) return <span className="text-gray-400">-</span>;
  const color = score >= 8 ? "text-green-600" : score >= 6 ? "text-blue-600" : score >= 4 ? "text-yellow-600" : "text-gray-500";
  return <span className={`font-bold ${color}`}>{score}/10</span>;
}

function LevelBadge({ level }) {
  if (!level) return <span className="text-gray-400">-</span>;
  return <span className={`font-bold ${LEVEL_COLORS[level] || "text-gray-500"}`}>{level}</span>;
}

function SeniorityFilters({ leads, activeFilter, onFilter }) {
  const counts = useMemo(() => {
    const c = { All: leads.length, CXO: 0, VP: 0, DIR: 0, MGR: 0 };
    leads.forEach((l) => { if (c[l.level] !== undefined) c[l.level]++; });
    return c;
  }, [leads]);

  const filters = [
    { key: "All", label: "All Levels", dot: "bg-gray-400" },
    { key: "CXO", label: "CXO & Founder", dot: "bg-red-500" },
    { key: "VP", label: "VP & SVP", dot: "bg-purple-500" },
    { key: "DIR", label: "Director", dot: "bg-blue-500" },
    { key: "MGR", label: "Manager", dot: "bg-green-500" },
  ];

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {filters.map((f) => (
        <button
          key={f.key}
          onClick={() => onFilter(f.key)}
          className={`px-4 py-2 rounded-full text-sm border transition flex items-center gap-2 ${
            activeFilter === f.key
              ? "bg-gray-900 text-white border-gray-700"
              : "bg-white text-gray-700 border-gray-300 hover:border-gray-400"
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${f.dot}`} />
          {f.label} ({counts[f.key] || 0})
        </button>
      ))}
    </div>
  );
}

function LeadTable({ leads: allLeads, company, companyMeta }) {
  const [filter, setFilter] = useState("All");

  const leads = useMemo(() => {
    if (filter === "All") return allLeads;
    return allLeads.filter((l) => l.level === filter);
  }, [allLeads, filter]);

  if (!allLeads || allLeads.length === 0) return null;

  const exportCSV = () => {
    const headers = ["Name", "Title", "Company", "Email", "LinkedIn", "Level", "Score"];
    const rows = leads.map((l) => [l.name, l.title, l.company, l.email, l.linkedin_url, l.level, l.score]);
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${(c || "").toString().replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leadsprout_${company || "leads"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Derive domain from company or first lead
  const domain = allLeads[0]?.domain || (company ? company.toLowerCase().replace(/\s+/g, "") + ".com" : "");

  return (
    <div className="mt-6 bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
      {company && (
        <div className="flex items-center gap-3 mb-5">
          {companyMeta?.domain ? (
            <img src={`${API}/logo/${companyMeta.domain}`} alt="" className="w-12 h-12 rounded-xl bg-gray-100 object-contain border border-gray-200 p-1"
              onError={(e) => { e.target.style.display = "none"; e.target.nextElementSibling && (e.target.nextElementSibling.style.display = "flex"); }} />
          ) : null}
          {!companyMeta?.domain && (
            <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center text-gray-700 font-bold text-lg border border-gray-200">
              {company[0]?.toUpperCase()}
            </div>
          )}
          <div>
            <h2 className="text-xl font-bold text-gray-900">{company}</h2>
            {(companyMeta?.domain || domain) && <p className="text-sm text-green-600">{companyMeta?.domain || domain}</p>}
          </div>
        </div>
      )}

      <SeniorityFilters leads={allLeads} activeFilter={filter} onFilter={setFilter} />

      <div className="flex justify-between items-center mb-3">
        <span className="text-sm text-gray-500">{leads.length} contacts</span>
        <button
          onClick={exportCSV}
          className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition flex items-center gap-1"
        >
          Export CSV
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 text-gray-500 uppercase text-xs border-b border-gray-200">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">LinkedIn</th>
              <th className="px-4 py-3">Level</th>
              <th className="px-4 py-3">Score</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead, i) => (
              <tr key={lead.id || i} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{lead.name || "—"}</td>
                <td className="px-4 py-3 text-gray-600">{lead.title || "—"}</td>
                <td className="px-4 py-3">
                  {lead.email ? (
                    <a href={`mailto:${lead.email}`} className="text-blue-600 hover:underline">{lead.email}</a>
                  ) : <span className="text-gray-400">—</span>}
                </td>
                <td className="px-4 py-3">
                  {lead.linkedin_url ? (
                    <a href={lead.linkedin_url} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-700 rounded text-xs border border-blue-200 hover:bg-blue-100 transition font-medium">
                      LinkedIn
                    </a>
                  ) : <span className="text-gray-400">—</span>}
                </td>
                <td className="px-4 py-3"><LevelBadge level={lead.level} /></td>
                <td className="px-4 py-3"><ScoreBadge score={lead.score} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FileUpload({ onUpload, loading, fileName, progress }) {
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  const handleFile = (file) => {
    if (!file) return;
    onUpload(file);
  };

  if (loading && fileName) {
    return (
      <div className="border-2 border-green-200 rounded-xl p-6 bg-green-50/50 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <svg className="animate-spin h-5 w-5 text-green-600" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
          <span className="font-semibold text-green-700">Processing {fileName}</span>
        </div>
        {progress && (
          <p className="text-sm text-green-600 mt-1">{progress}</p>
        )}
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
      onClick={() => fileRef.current?.click()}
      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
        dragOver ? "border-green-500 bg-green-50" : "border-gray-300 hover:border-green-400 hover:bg-green-50/50"
      }`}
    >
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.txt,.xlsx"
        className="hidden"
        onChange={(e) => handleFile(e.target.files[0])}
      />
      <div className="text-3xl mb-2">&#128196;</div>
      <p className="text-gray-700 font-medium">
        Drop a CSV file here, or click to browse
      </p>
      <p className="text-gray-400 text-sm mt-1">
        One company name per row. Supports .csv and .txt files
      </p>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState("search");
  const [query, setQuery] = useState("");
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [roles, setRoles] = useState("CFO, Founder, CEO, CTO, VP, Director, Manager");
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState(null);
  const [progress, setProgress] = useState("");
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchedCompany, setSearchedCompany] = useState("");
  const [uploadFileName, setUploadFileName] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    if (!jobId) return;
    const poll = async () => {
      try {
        const res = await fetch(`${API}/job/${jobId}`);
        const data = await res.json();
        setStatus(data.state);
        if (data.progress?.message) setProgress(data.progress.message);
        if (data.state === "completed") {
          clearInterval(pollRef.current);
          setLoading(false);
          const leadsRes = await fetch(`${API}/leads/${jobId}`);
          const leadsData = await leadsRes.json();
          setLeads(leadsData.leads || []);
        } else if (data.state === "failed") {
          clearInterval(pollRef.current);
          setLoading(false);
          setError("Job failed. Check server logs.");
        }
      } catch {}
    };
    pollRef.current = setInterval(poll, 2000);
    poll();
    return () => clearInterval(pollRef.current);
  }, [jobId]);

  const resetState = () => {
    setJobId(null);
    setStatus(null);
    setProgress("");
    setLeads([]);
    setError(null);
    setLoading(false);
    setUploadFileName(null);
    if (pollRef.current) clearInterval(pollRef.current);
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    resetState();
    setLoading(true);
    setSearchedCompany(query.trim());

    try {
      const roleList = roles.split(",").map((r) => r.trim()).filter(Boolean);
      const res = await fetch(`${API}/search-leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim(), roles: roleList }),
      });
      if (!res.ok) throw new Error("Failed to start search");
      const data = await res.json();
      setJobId(data.jobId);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleFileUpload = async (file) => {
    resetState();
    setLoading(true);
    setUploadFileName(file.name);
    setSearchedCompany(`Bulk Upload (${file.name})`);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API}/bulk-search`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Failed to upload file");
      const data = await res.json();
      setJobId(data.jobId);
      setSearchedCompany(`Bulk: ${data.companies?.slice(0, 3).join(", ")}${data.totalCompanies > 3 ? ` +${data.totalCompanies - 3} more` : ""}`);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-3">
          <span className="text-2xl font-bold text-green-600">LeadSprout</span>
          <span className="text-sm text-gray-400">B2B Lead Intelligence</span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Search / Upload Card */}
        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
          {/* Tabs */}
          <div className="flex gap-1 mb-5 bg-gray-100 rounded-lg p-1 w-fit">
            <button
              onClick={() => setTab("search")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                tab === "search" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Search Company
            </button>
            <button
              onClick={() => setTab("upload")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                tab === "upload" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Upload File
            </button>
          </div>

          {tab === "search" ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-gray-400">
                Search any company — Zepto, PhonePe, CRED, Nykaa, Groww...
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <CompanySearch
                  query={query}
                  setQuery={setQuery}
                  onSelect={(company) => {
                    if (company) setSelectedCompany(company);
                    handleSearch();
                  }}
                />
                <button
                  onClick={handleSearch}
                  disabled={loading || !query.trim()}
                  className="px-6 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg font-medium transition whitespace-nowrap"
                >
                  {loading ? "Searching..." : "Search Leads"}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm text-gray-400 mb-3">
                Upload a CSV or text file with company names (one per line)
              </p>
              <FileUpload onUpload={handleFileUpload} loading={loading} fileName={uploadFileName} progress={progress} />
            </div>
          )}

          {/* Status */}
          {(status || error) && (
            <div className="mt-4 p-3 rounded-lg bg-gray-50 border border-gray-200 text-sm">
              {error ? (
                <span className="text-red-500">{error}</span>
              ) : (
                <div className="flex items-center gap-3">
                  <span className={`inline-block w-2 h-2 rounded-full ${
                    status === "completed" ? "bg-green-500" : status === "failed" ? "bg-red-500" : "bg-yellow-500 animate-pulse"
                  }`} />
                  <span className="text-gray-600">
                    <strong className="text-gray-900 capitalize">{status}</strong>
                    {progress && ` — ${progress}`}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Results */}
        <LeadTable leads={leads} company={searchedCompany} companyMeta={selectedCompany} />

        {!loading && leads.length === 0 && !error && !status && (
          <div className="mt-16 text-center text-gray-400">
            <p className="text-lg">Enter a company name or upload a file to discover leads</p>
            <p className="text-sm mt-1">
              We'll search Google + LinkedIn, generate emails, and find phone numbers
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
