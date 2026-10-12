import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Search, RotateCcw, AlertCircle, AlertTriangle, Settings, X, ChevronDown, Check, Save, Shield, Flag, Lock, Unlock, Trash2, Users, UserPlus, Eye, EyeOff } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useSocAuth } from '../contexts/AuthContext';
import { createPortal } from 'react-dom';

function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs));
}

const GeometricMesh = () => {
    return (
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
            <svg width="100%" height="100%" className="absolute inset-0 opacity-[0.03]">
                <pattern id="mesh-pattern" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
                    <circle cx="2" cy="2" r="1.5" fill="#06b6d4" />
                    <line x1="2" y1="2" x2="100" y2="100" stroke="#06b6d4" strokeWidth="0.5" />
                    <line x1="2" y1="2" x2="100" y2="2" stroke="#06b6d4" strokeWidth="0.5" />
                    <line x1="100" y1="2" x2="100" y2="100" stroke="#06b6d4" strokeWidth="0.5" />
                </pattern>
                <rect width="100%" height="100%" fill="url(#mesh-pattern)" />
            </svg>
            <motion.div
                animate={{
                    opacity: [0.03, 0.08, 0.03],
                    scale: [1, 1.05, 1]
                }}
                transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
                className="absolute inset-[-10%] bg-[radial-gradient(circle_at_50%_50%,rgba(6,182,212,0.1)_0%,transparent_70%)]"
            />
        </div>
    );
};

// MiniSparkline removed for a cleaner tactical look per user request

const UserPreviewPanel = ({ selectedUser }: { selectedUser: any }) => {
    const { token } = useSocAuth();
    const [auditLogs, setAuditLogs] = useState<any[]>([]);
    const [isLoadingLogs, setIsLoadingLogs] = useState(false);

    useEffect(() => {
        let isMounted = true;
        const fetchLogs = async () => {
            if (!selectedUser || !token) return;
            setIsLoadingLogs(true);
            try {
                const response = await fetch(`http://${window.location.hostname}:8000/api/admin/audit/users/${selectedUser.id}?max_events=12`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok && isMounted) {
                    const data = await response.json();
                    setAuditLogs(data);
                }
            } catch (err) {
                console.error("Failed to fetch user audit logs", err);
            } finally {
                if (isMounted) setIsLoadingLogs(false);
            }
        };
        fetchLogs();
        return () => { isMounted = false; };
    }, [selectedUser, token]);

    if (!selectedUser) {
        return (
            <div className="bg-gradient-to-br from-slate-800/40 via-cyan-900/10 to-slate-900/40 backdrop-blur-xl rounded-2xl h-full p-8 flex flex-col items-center justify-center text-center border-2 border-cyan-500/30 shadow-[0_12px_40px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.03)] hover:border-cyan-400/50 transition-all duration-500 relative">
                <div className="w-24 h-24 rounded-full bg-slate-950/50 border border-white/5 flex items-center justify-center mb-8 shadow-inner relative overflow-hidden group">
                    <div className="absolute inset-0 micro-grid-bg opacity-10" />
                    <Users className="text-slate-700 w-12 h-12 group-hover:text-cyan-500/50 transition-colors" />
                </div>
                <h3 className="text-white font-mono text-xs tracking-[0.3em] uppercase mb-3">No Active Profile</h3>
                <p className="text-slate-500 text-[10px] font-mono leading-relaxed max-w-[200px]">SELECT AN OPERATIVE TO INITIALIZE DOSSIER RETRIEVAL</p>
            </div>
        );
    }

    return (
        <div className="bg-gradient-to-br from-slate-800/40 via-cyan-900/10 to-slate-900/40 backdrop-blur-xl rounded-2xl h-full flex flex-col overflow-hidden border-2 border-cyan-500/30 shadow-[0_12px_40px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.03)] hover:border-cyan-400/50 transition-all duration-500 relative">
            <div className="absolute inset-0 micro-grid-bg opacity-[0.03] pointer-events-none" />
            
            {/* Header / Avatar */}
            <div className="p-8 pb-6 text-center relative">
                <div className="relative inline-block mb-6">
                    {(() => {
                        const rs = getRoleStyle(selectedUser.role || '');
                        const initials = (selectedUser.name || '').split(' ').slice(0, 2).map((n: string) => n[0] || '').join('').toUpperCase() || '?';
                        return (
                            <>
                                <div className="absolute inset-0 rounded-3xl blur-3xl animate-pulse" style={{ backgroundColor: rs.glow }} />
                                <div className={cn("relative w-28 h-28 rounded-3xl bg-gradient-to-br from-slate-800 to-slate-950 border-2 flex items-center justify-center overflow-hidden shadow-[inset_0_2px_15px_rgba(0,0,0,0.8)]", rs.ring)}>
                                    <span className="text-4xl font-black text-white tracking-tighter">{initials}</span>
                                    <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                                    <div className="absolute bottom-0 inset-x-0 h-1/3 bg-gradient-to-t from-black/30 to-transparent" />
                                </div>
                            </>
                        );
                    })()}
                </div>
                <h2 className="text-2xl font-black text-white tracking-[0.1em] uppercase font-mono mb-2 premium-cyan-glow">{selectedUser.name}</h2>
                <div className={cn("inline-flex items-center gap-2 px-4 py-1.5 rounded-xl border text-[10px] font-mono font-black tracking-[0.15em] uppercase", getRoleStyle(selectedUser.role || '').badge)}>
                    <div className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                    {selectedUser.role}
                </div>
            </div>

            {/* Stats Divider */}
            <div className="px-8 grid grid-cols-2 gap-4 py-8 border-y border-white/10 bg-white/[0.02]">
                <div className="text-center">
                    <p className="text-slate-500 text-[9px] font-mono font-black uppercase tracking-[0.2em] mb-2">Registry Time</p>
                    <p className="text-white text-xs font-mono font-black uppercase tracking-widest">{selectedUser.joined || '2H 14M AGO'}</p>
                </div>
                <div className="text-center">
                    <p className="text-slate-500 text-[9px] font-mono font-black uppercase tracking-[0.2em] mb-2">Account Status</p>
                    <p className={cn("text-xs font-mono font-black uppercase tracking-widest", selectedUser.status === 'ACTIVE' ? "text-cyan-400 premium-cyan-glow" : "text-rose-400 premium-red-glow")}>{selectedUser.status}</p>
                </div>
            </div>

            {/* Activity Timeline */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar relative">
                <h3 className="text-slate-300 font-mono text-[10px] font-black tracking-[0.3em] uppercase mb-8 flex items-center gap-3">
                    <div className="w-4 h-[1px] bg-cyan-500/50" />
                    Authentication Logs
                </h3>
                <div className="space-y-8 relative ml-2">
                    <div className="absolute left-[3px] top-1 bottom-1 w-[1px] bg-cyan-500/20 shadow-[0_0_10px_rgba(34,211,238,0.3)]" />

                    {isLoadingLogs ? (
                        <div className="text-[10px] font-mono text-cyan-500/50 uppercase tracking-widest animate-pulse ml-8">Fetching securely...</div>
                    ) : auditLogs.length === 0 ? (
                        <div className="text-[10px] font-mono text-slate-500 uppercase tracking-widest ml-8">No authentication logs found</div>
                    ) : auditLogs.map((act: any, i: number) => {
                        const date = new Date(act.time);
                        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
                        return (
                            <div key={i} className="relative pl-8 group/item">
                                <div className="absolute left-0 top-1.5 w-2 h-2 rounded-full bg-slate-950 border-2 border-cyan-500/80 shadow-[0_0_8px_#22d3ee] group-hover/item:scale-125 transition-transform" />
                                <div className="flex flex-col mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-mono font-black text-cyan-400/90 tracking-wider">{timeStr}</span>
                                        <span className="text-cyan-900 font-mono text-[10px] font-bold">//</span>
                                        <span className="text-[10px] font-mono font-black text-cyan-500/70 uppercase tracking-tight truncate">{act.type.replace(/_/g, ' ')}</span>
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-cyan-400 text-[10px] font-mono font-black tracking-[0.2em] uppercase opacity-80">[{dateStr}]</span>
                                    </div>
                                </div>
                                <p className="text-[11px] text-slate-400 font-sans leading-relaxed group-hover:text-slate-200 transition-colors uppercase tracking-wide">{act.description}</p>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

const getRoleStyle = (role: string) => {
    if (role.includes('Manager'))
        return { badge: 'bg-cyan-500/10 border-cyan-400/40 text-cyan-300', ring: 'border-cyan-400/70', glow: 'rgba(34,211,238,0.35)', text: 'text-cyan-300' };
    if (role.includes('L3'))
        return { badge: 'bg-violet-500/10 border-violet-400/40 text-violet-300', ring: 'border-violet-400/70', glow: 'rgba(167,139,250,0.35)', text: 'text-violet-300' };
    if (role.includes('L2'))
        return { badge: 'bg-blue-500/10 border-blue-400/40 text-blue-300', ring: 'border-blue-400/70', glow: 'rgba(96,165,250,0.35)', text: 'text-blue-300' };
    return { badge: 'bg-cyan-500/10 border-cyan-400/40 text-cyan-300', ring: 'border-cyan-400/70', glow: 'rgba(34,211,238,0.35)', text: 'text-cyan-300' };
};

const StatusBadge = ({ status }: { status: string }) => {
    const isActive = status === 'ACTIVE';
    return (
        <div className={cn(
            "inline-flex items-center gap-2 px-3 py-1 rounded-lg border text-[10px] font-mono font-black tracking-[0.1em] transition-all",
            isActive 
                ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.1)]"
                : "bg-rose-500/10 border-rose-500/30 text-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.1)]"
        )}>
            <div className={cn("w-1.5 h-1.5 rounded-full", isActive ? "bg-cyan-400 animate-pulse shadow-[0_0_8px_#22d3ee]" : "bg-rose-400")} />
            {status}
        </div>
    );
};

const TacticalTooltip = ({ isOpen, x, y, children, type = 'cyan', side = 'right', width = '320px' }: { isOpen: boolean, x: number, y: number, children: React.ReactNode, type?: 'cyan' | 'rose', side?: 'top' | 'right' | 'left', width?: string }) => {
    if (!isOpen) return null;

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ 
                        opacity: 0, 
                        x: side === 'right' ? -10 : 0,
                        y: side === 'top' ? 10 : 0,
                        scale: 0.95 
                    }}
                    animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    style={{
                        position: 'fixed',
                        left: x,
                        top: y,
                        zIndex: 999999,
                        pointerEvents: 'none',
                        width: width
                    }}
                    className={cn(
                        "transform",
                        side === 'top' ? "-translate-x-1/2 -translate-y-full mb-8" : "translate-y-[-50%] ml-6"
                    )}
                >
                    {/* The Tactical Frame */}
                    <div className={cn(
                        "relative bg-slate-900/98 backdrop-blur-3xl border-2 rounded-xl p-0 shadow-[0_25px_60px_rgba(0,0,0,0.9)] overflow-hidden",
                        type === 'rose' ? "border-rose-500/50 shadow-rose-500/20" : "border-cyan-500/50 shadow-cyan-500/20"
                    )}>
                        {/* Corner Accents (The "Screws") */}
                        <div className="absolute top-1.5 left-1.5 w-1 h-1 rounded-full bg-white/10" />
                        <div className="absolute top-1.5 right-1.5 w-1 h-1 rounded-full bg-white/10" />
                        <div className="absolute bottom-1.5 left-1.5 w-1 h-1 rounded-full bg-white/10" />
                        <div className="absolute bottom-1.5 right-1.5 w-1 h-1 rounded-full bg-white/10" />

                        {/* Scanline Effect */}
                        <div className="absolute inset-0 opacity-[0.04] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-0 pointer-events-none bg-[length:100%_2px,3px_100%]" />

                        {children}
                    </div>
                    
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
};

const BentoStatCard = ({ icon: Icon, label, value, subValue, color, children, className, hoverDetail, tooltipWidth }: { icon: any, label: string, value?: string | number, subValue?: string, color?: string, children?: React.ReactNode, className?: string, hoverDetail?: React.ReactNode, tooltipWidth?: string }) => {
    const [isHovered, setIsHovered] = useState(false);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

    const numColor = color === 'emerald' ? 'text-cyan-400' : color === 'rose' ? 'text-rose-400' : 'text-cyan-300';
    const iconColor = color === 'emerald' ? 'text-cyan-500/60' : color === 'rose' ? 'text-rose-500/60' : 'text-cyan-500/40';

    const shadowStyle =
        color === 'emerald'
            ? 'hover:shadow-[0_0_30px_rgba(34,211,238,0.15),inset_0_1px_0_rgba(255,255,255,0.05)] hover:border-cyan-400/60'
            : color === 'rose'
            ? 'hover:shadow-[0_0_30px_rgba(244,63,94,0.15),inset_0_1px_0_rgba(255,255,255,0.05)] hover:border-rose-400/60'
            : 'hover:shadow-[0_0_30px_rgba(34,211,238,0.15),inset_0_1px_0_rgba(255,255,255,0.05)] hover:border-cyan-400/60';

    const bgStyle = 'bg-gradient-to-br from-slate-800/40 via-cyan-900/10 to-slate-900/40';

    const borderStyle = 'border-cyan-500/30';

    return (
        <div className={cn(
            "backdrop-blur-xl border rounded-2xl p-5 shadow-[0_8px_32px_rgba(0,0,0,0.35)] transition-all duration-300 relative overflow-hidden group",
            bgStyle,
            borderStyle,
            shadowStyle,
            className
        )}>
            {/* Subtle ambient light glow on hover */}
            <div className={cn(
                "absolute -inset-y-0 -inset-x-0 bg-[radial-gradient(circle_at_50%_0%,rgba(6,182,212,0.03),transparent_60%)] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none",
                color === 'emerald' && "bg-[radial-gradient(circle_at_50%_0%,rgba(16,185,129,0.03),transparent_60%)]",
                color === 'rose' && "bg-[radial-gradient(circle_at_50%_0%,rgba(244,63,94,0.03),transparent_60%)]"
            )} />

            {hoverDetail && (
                <TacticalTooltip
                    isOpen={isHovered}
                    x={mousePos.x}
                    y={mousePos.y}
                    type={color === 'rose' ? 'rose' : 'cyan'}
                    width={tooltipWidth}
                >
                    {hoverDetail}
                </TacticalTooltip>
            )}
            <div className="flex items-center justify-between mb-4 relative z-10">
                <span className="text-[11px] font-mono font-bold text-cyan-500/50 uppercase tracking-wider">{label}</span>
                <Icon size={15} className={cn("transition-colors duration-300", iconColor, "group-hover:text-white/80")} />
            </div>
            {value !== undefined && (
                <p
                    onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
                    onMouseEnter={() => setIsHovered(true)}
                    onMouseLeave={() => setIsHovered(false)}
                    className={cn("text-3xl font-bold font-mono tracking-tight leading-none relative z-10 transition-transform duration-300 group-hover:translate-x-0.5", numColor, hoverDetail && "cursor-help")}
                >
                    {value}
                </p>
            )}
            {subValue && <p className="text-xs text-slate-500 mt-1.5 relative z-10 font-mono">{subValue}</p>}
            <div className="relative z-10">
                {children}
            </div>
        </div>
    );
};


const CustomDropdown = ({ label, value, options, onChange }: { label: string, value: string, options: string[], onChange: (val: string) => void }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className={cn("relative space-y-2", isOpen ? "z-50" : "z-10")}>
            <label className="text-[10px] font-mono font-bold text-cyan-400 uppercase tracking-widest ml-1">{label}</label>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "w-full bg-slate-950/50 border-2 border-slate-700/50 hover:border-cyan-500/50 focus:outline-none rounded-xl py-3 px-4 flex items-center justify-between transition-all",
                    isOpen && "border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.1)]"
                )}
            >
                <span className="text-sm font-medium text-cyan-100 tracking-wide font-sans">{value}</span>
                <ChevronDown className={cn("text-slate-500 transition-transform duration-300", isOpen && "rotate-180 text-cyan-400")} size={18} />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
                        <motion.div
                            initial={{ opacity: 0, y: -10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -10, scale: 0.95 }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                            className="absolute top-full left-0 right-0 mt-2 z-50 bg-slate-950 backdrop-blur-2xl border border-cyan-500/50 rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.8)] py-2"
                        >
                            {options.map((option) => (
                                <button
                                    key={option}
                                    type="button"
                                    onClick={() => {
                                        onChange(option);
                                        setIsOpen(false);
                                    }}
                                    className={cn(
                                        "w-full px-4 py-3 flex items-center justify-between transition-colors text-left group",
                                        value === option ? "bg-cyan-500/10" : "hover:bg-white/5"
                                    )}
                                >
                                    <span className={cn(
                                        "text-sm font-sans transition-colors",
                                        value === option ? "text-cyan-400 font-bold" : "text-slate-400 group-hover:text-white"
                                    )}>
                                        {option}
                                    </span>
                                    {value === option && <Check size={14} className="text-cyan-400" />}
                                </button>
                            ))}
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
};

const ProvisionUserModal = ({ isOpen, onClose, onAdd }: { isOpen: boolean, onClose: () => void, onAdd: (user: any) => void }) => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [role, setRole] = useState('L1 SOC Analyst');

    const isFormValid = name.trim() !== '' && email.trim() !== '' && password.trim() !== '';

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!isFormValid) return;

        onAdd({
            name,
            email,
            password,
            role
        });

        setName('');
        setEmail('');
        setPassword('');
        setRole('L1 SOC Analyst');
        onClose();
    };

    const roleOptions = ['SOC Manager', 'L3 SOC Analyst', 'L2 SOC Analyst', 'L1 SOC Analyst'];

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 16 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 16 }}
                        className="relative w-full max-w-lg bg-slate-900/70 backdrop-blur-xl border border-cyan-500/20 rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.6)]"
                    >
                        {/* Modal Header */}
                        <div className="flex items-center justify-between px-6 py-5 border-b border-cyan-500/15">
                            <h3 className="text-sm font-semibold text-white flex items-center gap-2.5 tracking-wide">
                                <UserPlus className="text-cyan-400 w-4 h-4" />
                                Add User
                            </h3>
                            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors">
                                <X size={16} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5">
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-medium text-cyan-400/70 uppercase tracking-widest flex items-center gap-1">
                                    Full Name <span className="text-rose-400">*</span>
                                </label>
                                <input
                                    autoFocus
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full bg-slate-950/60 border border-cyan-500/20 hover:border-cyan-500/35 focus:border-cyan-500/60 focus:outline-none rounded-lg py-2.5 px-4 text-sm text-slate-200 transition-all placeholder:text-slate-600 [&:-webkit-autofill]:!bg-slate-950 [&:-webkit-autofill]:!shadow-[0_0_0_1000px_#020617_inset] [&:-webkit-autofill]:!text-slate-200"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-medium text-cyan-400/70 uppercase tracking-widest flex items-center gap-1">
                                        Email Address <span className="text-rose-400">*</span>
                                    </label>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="user@bluesec.local"
                                        className="w-full bg-slate-950/60 border border-cyan-500/20 hover:border-cyan-500/35 focus:border-cyan-500/60 focus:outline-none rounded-lg py-2.5 px-4 text-sm text-slate-200 transition-all placeholder:text-slate-600 [&:-webkit-autofill]:!bg-slate-950 [&:-webkit-autofill]:!shadow-[0_0_0_1000px_#020617_inset] [&:-webkit-autofill]:!text-slate-200"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-medium text-cyan-400/70 uppercase tracking-widest flex items-center gap-1">
                                        Initial Password <span className="text-rose-400">*</span>
                                    </label>
                                    <div className="relative">
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="••••••••"
                                            className="w-full bg-slate-950/60 border border-cyan-500/20 hover:border-cyan-500/35 focus:border-cyan-500/60 focus:outline-none rounded-lg py-2.5 pl-4 pr-10 text-sm text-slate-200 transition-all placeholder:text-slate-500 [&:-webkit-autofill]:!bg-slate-950 [&:-webkit-autofill]:!shadow-[0_0_0_1000px_#020617_inset] [&:-webkit-autofill]:!text-slate-200"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(v => !v)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-cyan-400 transition-colors"
                                        >
                                            {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <CustomDropdown
                                label="Assigned Role"
                                value={role}
                                options={roleOptions}
                                onChange={setRole}
                            />

                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="flex-1 py-2.5 bg-transparent hover:bg-white/5 border border-slate-700 hover:border-slate-600 rounded-lg text-slate-400 hover:text-slate-200 text-sm font-medium transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={!isFormValid}
                                    className={cn(
                                        "flex-[1.5] py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2",
                                        isFormValid
                                            ? "bg-cyan-500 hover:bg-cyan-400 text-slate-900"
                                            : "bg-slate-800/60 text-slate-600 cursor-not-allowed border border-slate-700/50"
                                    )}
                                >
                                    <UserPlus size={15} />
                                    Add User
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

const EditUserModal = ({ isOpen, user, onClose, onEdit }: { isOpen: boolean, user: any, onClose: () => void, onEdit: (user: any) => void }) => {
    const { user: currentUser } = useSocAuth();
    const isCurrentUser = user && currentUser?.sub === user.id;

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [role, setRole] = useState('');

    useEffect(() => {
        if (user) {
            setName(user.name);
            setEmail(user.email || '');
            setRole(user.role);
            setPassword('');
        }
    }, [user, isOpen]);

    const isFormValid = name.trim() !== '' && email.trim() !== '';

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!isFormValid || !user) return;

        onEdit({
            id: user.id,
            name,
            email,
            password,
            role,
            status: user.status
        });

        onClose();
    };

    const roleOptions = ['SOC Manager', 'L3 SOC Analyst', 'L2 SOC Analyst', 'L1 SOC Analyst'];

    return (
        <AnimatePresence>
            {isOpen && user && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 16 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 16 }}
                        className="relative w-full max-w-lg bg-slate-900/70 backdrop-blur-xl border border-cyan-500/20 rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.6)]"
                    >
                        {/* Modal Header */}
                        <div className="flex items-center justify-between px-6 py-5 border-b border-cyan-500/15">
                            <h3 className="text-sm font-semibold text-white flex items-center gap-2.5 tracking-wide">
                                <Settings className="text-cyan-400 w-4 h-4" />
                                Edit Profile & Security
                            </h3>
                            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors">
                                <X size={16} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5">
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-medium text-cyan-400/70 uppercase tracking-widest flex items-center gap-1">
                                    Full Name <span className="text-rose-400">*</span>
                                </label>
                                <input
                                    autoFocus
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full bg-slate-950/60 border border-cyan-500/20 hover:border-cyan-500/35 focus:border-cyan-500/60 focus:outline-none rounded-lg py-2.5 px-4 text-sm text-slate-200 transition-all [&:-webkit-autofill]:!bg-slate-950 [&:-webkit-autofill]:!shadow-[0_0_0_1000px_#020617_inset] [&:-webkit-autofill]:!text-slate-200"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-medium text-cyan-400/70 uppercase tracking-widest flex items-center gap-1 h-4">
                                        Email Address <span className="text-rose-400">*</span>
                                    </label>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full bg-slate-950/60 border border-cyan-500/20 hover:border-cyan-500/35 focus:border-cyan-500/60 focus:outline-none rounded-lg py-2.5 px-4 text-sm text-slate-200 transition-all [&:-webkit-autofill]:!bg-slate-950 [&:-webkit-autofill]:!shadow-[0_0_0_1000px_#020617_inset] [&:-webkit-autofill]:!text-slate-200"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-medium text-cyan-400/70 uppercase tracking-widest flex items-center h-4">
                                        Force Password Reset
                                    </label>
                                    <div className="relative">
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="Leave blank to keep"
                                            className="w-full bg-slate-950/60 border border-cyan-500/20 hover:border-cyan-500/35 focus:border-cyan-500/60 focus:outline-none rounded-lg py-2.5 pl-4 pr-10 text-sm text-slate-200 transition-all placeholder:text-slate-600 [&:-webkit-autofill]:!bg-slate-950 [&:-webkit-autofill]:!shadow-[0_0_0_1000px_#020617_inset] [&:-webkit-autofill]:!text-slate-200"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(v => !v)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-cyan-400 transition-colors"
                                        >
                                            {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div>
                                {isCurrentUser ? (
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-medium text-slate-600 uppercase tracking-widest flex items-center gap-2">
                                            Assigned Role
                                            <span className="text-cyan-500/50 normal-case tracking-normal text-[10px]">(Current account)</span>
                                        </label>
                                        <div className="w-full bg-slate-950/40 border border-slate-800 rounded-lg py-2.5 px-4 text-sm text-slate-500 cursor-not-allowed select-none">
                                            {role}
                                        </div>
                                    </div>
                                ) : (
                                    <CustomDropdown
                                        label="Assigned Role"
                                        value={role}
                                        options={roleOptions}
                                        onChange={setRole}
                                    />
                                )}
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="flex-1 py-2.5 bg-transparent hover:bg-white/5 border border-slate-700 hover:border-slate-600 rounded-lg text-slate-400 hover:text-slate-200 text-sm font-medium transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={!isFormValid}
                                    className={cn(
                                        "flex-[1.5] py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2",
                                        isFormValid
                                            ? "bg-cyan-500 hover:bg-cyan-400 text-slate-900"
                                            : "bg-slate-800/60 text-slate-600 cursor-not-allowed border border-slate-700/50"
                                    )}
                                >
                                    <Save size={15} className={isFormValid ? "text-slate-900" : "text-slate-600"} />
                                    Save Changes
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

const DeleteConfirmationModal = ({ user, onClose, onConfirm }: { user: { id: string, name: string } | null, onClose: () => void, onConfirm: () => void }) => {
    return (
        <AnimatePresence>
            {user && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 16 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 16 }}
                        className="relative w-full max-w-sm bg-slate-900/70 backdrop-blur-xl border border-rose-500/25 rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.6)] overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-5 border-b border-rose-500/15">
                            <h3 className="text-sm font-semibold text-white flex items-center gap-2.5">
                                <AlertCircle className="text-rose-400 w-4 h-4" />
                                Delete User
                            </h3>
                            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors">
                                <X size={16} />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-6">
                            <p className="text-sm text-slate-400 text-center leading-relaxed">
                                Permanently delete <span className="text-white font-semibold">{user.name}</span>?
                            </p>
                            <p className="text-xs text-rose-500/60 text-center mt-2">
                                This action cannot be undone.
                            </p>

                            <div className="flex gap-3 mt-6">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="flex-1 py-2.5 bg-transparent hover:bg-white/5 border border-slate-700 hover:border-slate-600 rounded-lg text-slate-400 hover:text-slate-200 text-sm font-medium transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => { onConfirm(); onClose(); }}
                                    className="flex-[1.5] py-2.5 rounded-lg text-sm font-semibold transition-all bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 hover:border-rose-400/60"
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

interface Analyst {
    id: string;
    displayId: string;
    name: string;
    email: string;
    role: string;
    status: string;
    joined: string;
}

export const UserManagement = () => {
    const { user: currentUser, token } = useSocAuth();
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [userToDelete, setUserToDelete] = useState<{ id: string, name: string } | null>(null);
    const [loginErrorsCount, setLoginErrorsCount] = useState<number>(0);
    const [loginStats, setLoginStats] = useState({ success: 0, error: 0 });
    const [recentFlags, setRecentFlags] = useState<any[]>([]);
    const [activeUsersList, setActiveUsersList] = useState<any[]>([]);
    const [analysts, setAnalysts] = useState<Analyst[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeSessionsCount, setActiveSessionsCount] = useState<number>(0);

    const fetchUsers = async () => {
        try {
            setIsLoading(true);
            const response = await fetch(`http://${window.location.hostname}:8000/api/admin/users`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (response.ok) {
                const data = await response.json();
                // Map Keycloak data to our UI format
                const mappedUsers = data.map((u: any) => {
                    try {
                        const roles = u.roles || [];
                        // 1. Try to get role from the 'title' field (sent by backend)
                        let roleDisplay = (u.title && u.title.trim() && u.title !== 'Analyst') ? u.title : '';
                        
                        // 2. If title is generic or missing, derive from technical Keycloak roles
                        if (!roleDisplay) {
                            const socioRoles = roles.map((r: string) => r.toLowerCase());
                            
                            if (socioRoles.includes('soc_admin') || socioRoles.includes('admin') || socioRoles.includes('manager')) {
                                roleDisplay = 'SOC Manager';
                            } else if (socioRoles.includes('soc_analyst_l3')) {
                                roleDisplay = 'L3 SOC Analyst';
                            } else if (socioRoles.includes('soc_analyst_l2')) {
                                roleDisplay = 'L2 SOC Analyst';
                            } else if (socioRoles.includes('soc_analyst') || socioRoles.includes('analyst')) {
                                roleDisplay = 'L1 SOC Analyst';
                            } else if (u.title) {
                                // Last resort fallback to the title sent by backend
                                roleDisplay = u.title;
                            } else {
                                roleDisplay = 'SOC Analyst';
                            }
                        }
                        const userName = `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.username || 'Unknown User';

                        let joinedDate = 'N/A';
                        if (u.createdTimestamp) {
                            try {
                                joinedDate = new Date(u.createdTimestamp).toISOString().split('T')[0];
                            } catch (e) {
                                joinedDate = 'N/A';
                            }
                        }

                        return {
                            id: u.id || '',
                            displayId: (u.id || '').substring(0, 8).toUpperCase() || 'UNKNOWN',
                            name: userName,
                            email: u.email || '',
                            role: roleDisplay,
                            status: u.enabled ? 'ACTIVE' : 'SUSPENDED',
                            joined: joinedDate
                        };
                    } catch (e) {
                        console.error('Mapping error for individual user:', u, e);
                        return null; // Don't crash the whole list for one bad entry
                    }
                }).filter((u: Analyst | null): u is Analyst => u !== null);
                setAnalysts(mappedUsers);
            }

            // Fetch live session stats natively from Keycloak
            const statsResponse = await fetch(`http://${window.location.hostname}:8000/api/admin/stats`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (statsResponse.ok) {
                const statsData = await statsResponse.json();
                setActiveSessionsCount(statsData.active_sessions || 0);
            }

        } catch (error) {
            console.error('Failed to fetch users or stats:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // Function to fetch ONLY stats (for real-time polling)
    const fetchStatsOnly = async () => {
        if (!token) return;
        try {
            const statsResponse = await fetch(`http://${window.location.hostname}:8000/api/admin/stats`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (statsResponse.ok) {
                const statsData = await statsResponse.json();
                setActiveSessionsCount(statsData.active_sessions || 0);
                setActiveUsersList(statsData.active_users || []);
            }

            // Fetch login activity for "Access flags" and "Security Audit" with a larger window to avoid rotation issues
            const activityResponse = await fetch(`http://${window.location.hostname}:8000/api/admin/audit/login-activity?max_events=200`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (activityResponse.ok) {
                const activityData = await activityResponse.json();

                // Security Flags (Errors)
                const errors = activityData.filter((e: any) =>
                    e.type === 'LOGIN_ERROR' || (e.details && e.details.error)
                );
                setLoginErrorsCount(errors.length);
                setRecentFlags(errors.slice(0, 3));

                // Security Audit (Stats for last 24h)
                const now = Date.now();
                const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);
                const recentActivities = activityData.filter((e: any) => e.time > twentyFourHoursAgo);

                const stats = recentActivities.reduce((acc: any, curr: any) => {
                    if (curr.type === 'LOGIN') acc.success++;
                    if (curr.type === 'LOGIN_ERROR') acc.error++;
                    return acc;
                }, { success: 0, error: 0 });
                setLoginStats(stats);
            }
        } catch (error) {
            console.error('Failed to poll stats:', error);
        }
    };

    useEffect(() => {
        if (token) {
            fetchUsers();
            fetchStatsOnly(); // Call immediately to avoid 5s lag

            // Set up real-time polling for stats every 5 seconds
            const statsInterval = setInterval(fetchStatsOnly, 5000);
            return () => clearInterval(statsInterval);
        }
    }, [token]);

    const handleAddUser = async (newUserData: any) => {
        try {
            const response = await fetch(`http://${window.location.hostname}:8000/api/admin/users`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: newUserData.name,
                    email: newUserData.email,
                    password: newUserData.password,
                    role: newUserData.role
                })
            });

            if (response.ok) {
                // Refresh list after success
                await fetchUsers();
            }
        } catch (error) {
            console.error('Failed to add user:', error);
        }
    };

    const handleEditUser = async (updatedUserData: any) => {
        try {
            const response = await fetch(`http://${window.location.hostname}:8000/api/admin/users/${updatedUserData.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: updatedUserData.name,
                    email: updatedUserData.email,
                    password: updatedUserData.password,
                    role: updatedUserData.role,
                    status: updatedUserData.status
                })
            });

            if (response.ok) {
                await fetchUsers();
            }
        } catch (error) {
            console.error('Failed to edit user:', error);
        }
    };

    const handleToggleStatus = async (analyst: Analyst) => {
        const newStatus = analyst.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
        try {
            const response = await fetch(`http://${window.location.hostname}:8000/api/admin/users/${analyst.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: analyst.name,
                    email: analyst.email,
                    role: analyst.role,
                    status: newStatus
                })
            });

            if (response.ok) {
                await fetchUsers();
            }
        } catch (error) {
            console.error('Failed to toggle status:', error);
        }
    };

    const executeDeleteUser = async () => {
        if (!userToDelete) return;

        try {
            const response = await fetch(`http://${window.location.hostname}:8000/api/admin/users/${userToDelete.id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                await fetchUsers();
            } else {
                console.error('Failed to delete user');
            }
        } catch (error) {
            console.error('Delete error:', error);
        }
    };

    const filteredAnalysts = analysts.filter((a: any) => {
        return a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            a.displayId.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (a.role || '').toLowerCase().includes(searchTerm.toLowerCase());
    });

    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [userToEdit, setUserToEdit] = useState<any>(null);

    return (
        <div className="h-full relative">
            <GeometricMesh />

            <ProvisionUserModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onAdd={handleAddUser}
            />

            <EditUserModal
                isOpen={isEditModalOpen}
                user={userToEdit}
                onClose={() => setIsEditModalOpen(false)}
                onEdit={handleEditUser}
            />

            <DeleteConfirmationModal
                user={userToDelete}
                onClose={() => setUserToDelete(null)}
                onConfirm={executeDeleteUser}
            />

            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="relative z-10 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 p-2 min-h-0 h-full"
            >
                {/* LEFT COLUMN (80%) */}
                <div className="flex flex-col gap-4 h-full p-2 min-h-0">
                    {/* HEADER */}
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-lg font-semibold text-white flex items-center gap-2.5">
                                <Users size={18} className="text-slate-400" />
                                Users Management
                            </h1>
                            <p className="text-sm text-slate-500 mt-0.5">Manage platform operators and access permissions</p>
                        </div>
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-900 rounded-lg text-sm font-semibold transition-colors"
                        >
                            <UserPlus size={15} />
                            Add User
                        </button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <BentoStatCard
                            icon={Users}
                            label="Total users"
                            value={analysts.length}
                        />
                        <BentoStatCard
                            icon={Activity}
                            label="Active sessions"
                            value={activeSessionsCount}
                            color="emerald"
                            tooltipWidth="320px"
                            hoverDetail={
                                <div className="flex flex-col font-mono relative z-10">
                                    {/* Clean Header */}
                                    <div className="flex items-center gap-4 p-4 pb-3 border-b border-white/10 bg-white/[0.02]">
                                        <div className="flex flex-col">
                                            <h4 className="text-[14px] font-black text-white/90 uppercase tracking-[0.2em]">Active Sessions</h4>
                                        </div>
                                    </div>

                                    {/* Status Indicator */}
                                    <div className="px-4 py-2 bg-white/[0.04] flex items-center gap-3 border-b border-white/5">
                                        <div className="px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/40 flex items-center gap-1.5">
                                            <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                                            <span className="text-[9px] font-black text-cyan-200 uppercase letter-spacing-1.5 tracking-widest">LIVE</span>
                                        </div>
                                    </div>
                                    
                                    {/* Table Content */}
                                    <div className="p-4 pt-4 space-y-4">
                                        <div className="flex flex-col gap-3 max-h-[320px] overflow-y-auto cyber-scrollbar pr-1">
                                            {activeUsersList.length > 0 ? activeUsersList.map((session: any, idx: number) => {
                                                const start = session.start 
                                                    ? new Date(session.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) 
                                                    : '--:--';
                                                const durationMs = session.start ? Date.now() - session.start : 0;
                                                const durationMin = Math.max(1, Math.floor(durationMs / 60000));
                                                const durationStr = durationMin >= 60 
                                                    ? `${Math.floor(durationMin / 60)}h ${durationMin % 60}m` 
                                                    : `${durationMin}m`;

                                                return (
                                                    <div key={idx} className="space-y-2 border-l-2 border-cyan-500/30 pl-3 py-1 bg-cyan-500/[0.01]">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">User</span>
                                                            <span className="text-[11px] font-black text-cyan-100">{session.username}</span>
                                                        </div>
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">IP</span>
                                                            <span className="text-[11px] font-black text-white/80">{session.ip || session.ipAddress}</span>
                                                        </div>
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Session Start</span>
                                                            <span className="text-[11px] font-bold text-slate-300">{start}</span>
                                                        </div>
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Session Time</span>
                                                            <span className="text-[11px] font-black text-cyan-400">{durationStr}</span>
                                                        </div>
                                                        {idx < activeUsersList.length - 1 && <div className="h-[1px] bg-white/5 mt-2" />}
                                                    </div>
                                                );
                                            }) : (
                                                <div className="text-[10px] text-slate-500 italic py-6 text-center uppercase tracking-[0.2em]">Zero Connections Found</div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            }
                        />
                        <BentoStatCard
                            icon={Shield}
                            label="Security Audit"
                        >
                            <div className="flex flex-col gap-2.5 mt-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-[9px] font-mono text-slate-400 uppercase">Success (24h)</span>
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
                                        <span className="text-xs font-mono font-bold text-white">{loginStats.success}</span>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-[9px] font-mono text-slate-400 uppercase">Blocked (24h)</span>
                                    <div className="flex items-center gap-1.5">
                                        <div className={cn("w-1.5 h-1.5 rounded-full", loginStats.error > 0 ? "bg-rose-500 shadow-[0_0_8px_#ef4444]" : "bg-slate-700")} />
                                        <span className={cn("text-xs font-mono font-bold", loginStats.error > 0 ? "text-rose-400 font-black" : "text-slate-500")}>{loginStats.error}</span>
                                    </div>
                                </div>
                            </div>
                        </BentoStatCard>
                        <BentoStatCard
                            icon={Flag}
                            label="Access flags"
                            value={loginErrorsCount > 0 ? loginErrorsCount : 0}
                            subValue={loginErrorsCount === 0 ? "Status: Clean" : undefined}
                            color={loginErrorsCount > 0 ? "rose" : "emerald"}
                            tooltipWidth="480px"
                            hoverDetail={
                                <div className="flex flex-col font-mono relative z-10">
                                    {/* Traditional Grid Header */}
                                    <div className={cn("flex items-center justify-between border-b p-4", loginErrorsCount > 0 ? "bg-rose-500/10 border-rose-500/30" : "bg-cyan-500/10 border-cyan-500/30")}>
                                        <div className="flex items-center gap-2">
                                            <AlertTriangle size={14} className={cn(loginErrorsCount > 0 ? "text-rose-500 animate-pulse" : "text-cyan-500")} />
                                            <span className={cn("text-[11px] font-black uppercase tracking-[0.2em]", loginErrorsCount > 0 ? "text-rose-400" : "text-cyan-400")}>
                                                {loginErrorsCount > 0 ? "Flagged events" : "System Secure"}
                                            </span>
                                        </div>
                                    </div>
                                    
                                    {/* The Original Grid Form */}
                                    <div className="p-4 space-y-3">
                                        <div className="grid grid-cols-[1.2fr_0.8fr_0.6fr_1fr] gap-4 text-[9px] text-rose-400/80 font-black uppercase tracking-widest border-b border-white/5 pb-2">
                                            <div>Event</div>
                                            <div>User</div>
                                            <div>Time</div>
                                            <div>IP</div>
                                        </div>
                                        <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto cyber-scrollbar pr-1">
                                            {recentFlags.length > 0 ? recentFlags.map((flag: any, i: number) => {
                                                const eventType = (flag.type || 'LOGIN_ERROR').replace(/_/g, ' ');
                                                const user = flag.details?.username || flag.username || flag.userId || 'Unknown';
                                                const time = flag.time ? new Date(flag.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '--:--';
                                                const ip = flag.ipAddress || '0.0.0.0';
                                                
                                                return (
                                                    <div key={i} className="grid grid-cols-[1.2fr_0.8fr_0.6fr_1fr] gap-4 items-center text-[10px] py-1 border-b border-white/[0.02] last:border-0">
                                                        <div className="text-rose-500 font-black tracking-tighter uppercase flex items-center gap-1.5 truncate">
                                                            <div className="w-1 h-1 bg-rose-500 rounded-full shadow-[0_0_5px_#ef4444]" />
                                                            {eventType}
                                                        </div>
                                                        <div className="text-white/90 font-bold truncate">{user}</div>
                                                        <div className="text-slate-400 font-bold">{time}</div>
                                                        <div className="text-slate-300 font-bold font-mono tracking-tighter">{ip}</div>
                                                    </div>
                                                );
                                            }) : (
                                                <div className="text-[10px] text-slate-500 italic py-6 text-center uppercase tracking-[0.2em]">Zero Violations Flagged</div>
                                            )}
                                        </div>

                                        {/* Professional Footer for Large Datasets */}
                                        {loginErrorsCount > recentFlags.length && (
                                            <div className="pt-3 border-t border-rose-500/20 flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-rose-500/50" />
                                                    <span className="text-[9px] font-bold text-rose-300/80 uppercase tracking-widest leading-none">
                                                        +{loginErrorsCount - recentFlags.length} Hidden incidents
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1.5 text-[9px] font-black text-rose-400 uppercase tracking-widest bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                                                    Check the login activity TAB
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            }
                        />
                    </div>
                    {/* USERS TABLE */}
                    <div className="flex flex-col min-h-0 flex-1 bg-gradient-to-br from-slate-800/40 via-cyan-900/10 to-slate-900/40 backdrop-blur-xl border-2 border-cyan-500/30 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.03)] hover:border-cyan-400/50 transition-all duration-500 overflow-hidden relative group/table">
                        {/* Search toolbar */}
                        <div className="flex items-center gap-3 px-4 py-3 border-b border-cyan-500/10 bg-slate-950/15">
                            <Search size={14} className="text-cyan-500/40 shrink-0" />
                            <input
                                type="text"
                                placeholder="Search by name, ID or role..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="flex-1 bg-transparent border-none focus:outline-none text-sm text-slate-300 placeholder:text-cyan-500/30 font-sans tracking-wide"
                            />
                            <button onClick={fetchUsers} className="p-1.5 text-cyan-500/30 hover:text-cyan-400 transition-colors rounded-md hover:bg-cyan-500/10">
                                <RotateCcw size={13} />
                            </button>
                        </div>

                        {/* Column headers */}
                        <div className="grid grid-cols-[32%_30%_18%_auto] px-4 py-3 text-[11px] font-bold text-cyan-400/50 uppercase tracking-wider border-b border-cyan-500/10 bg-slate-950/40 font-mono">
                            <span>User</span>
                            <span>Role</span>
                            <span>Status</span>
                            <span className="text-right">Actions</span>
                        </div>

                        {/* Rows */}
                        <div className="overflow-y-auto flex-1 custom-scrollbar">
                            <AnimatePresence mode="popLayout">
                                {!isLoading && filteredAnalysts.length === 0 ? (
                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="py-16 text-center">
                                        <AlertCircle className="w-6 h-6 text-slate-700 mx-auto mb-3" />
                                        <span className="text-sm text-slate-600">No users found</span>
                                    </motion.div>
                                ) : (
                                    !isLoading && filteredAnalysts.map((analyst) => (
                                        <motion.div
                                            key={analyst.id}
                                            layout
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            onClick={() => setUserToEdit(analyst)}
                                            className={cn(
                                                "group grid grid-cols-[32%_30%_18%_auto] items-center px-4 py-3.5 border-b border-cyan-500/5 last:border-b-0 cursor-pointer transition-all duration-300 relative overflow-hidden",
                                                userToEdit?.id === analyst.id
                                                    ? "bg-gradient-to-r from-cyan-500/[0.08] to-transparent"
                                                    : "hover:bg-cyan-500/[0.03]"
                                            )}
                                        >
                                            {/* Selection cyber bar */}
                                            {userToEdit?.id === analyst.id && (
                                                <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-cyan-400 shadow-[0_0_8px_#22d3ee] z-10" />
                                            )}
                                            {/* User */}
                                            <div className="flex items-center gap-3">
                                                <div className={cn(
                                                    "w-8 h-8 rounded-lg flex items-center justify-center text-xs font-semibold shrink-0 border",
                                                    getRoleStyle(analyst.role).badge
                                                )}>
                                                    {analyst.name.split(' ').slice(0, 2).map((n: string) => n[0] || '').join('').toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium text-slate-200 group-hover:text-white transition-colors">{analyst.name}</p>
                                                    <p className="text-xs text-slate-600 font-mono">{analyst.displayId}</p>
                                                </div>
                                            </div>

                                            {/* Role */}
                                            <div>
                                                <span className={cn(
                                                    "inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-medium",
                                                    getRoleStyle(analyst.role).badge
                                                )}>
                                                    {analyst.role}
                                                </span>
                                            </div>

                                            {/* Status */}
                                            <div>
                                                <StatusBadge status={analyst.status} />
                                            </div>

                                            {/* Actions */}
                                            <div className="flex items-center justify-end gap-1">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); if (analyst.id !== currentUser?.sub) handleToggleStatus(analyst); }}
                                                    disabled={analyst.id === currentUser?.sub}
                                                    title={analyst.id === currentUser?.sub ? 'Cannot suspend self' : analyst.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                                                    className={cn(
                                                        "p-1.5 rounded-md transition-colors",
                                                        analyst.id === currentUser?.sub
                                                            ? "text-slate-700 cursor-not-allowed"
                                                            : analyst.status === 'ACTIVE'
                                                                ? "text-slate-500 hover:text-cyan-400 hover:bg-cyan-500/10"
                                                                : "text-slate-500 hover:text-amber-400 hover:bg-amber-500/10"
                                                    )}
                                                >
                                                    {analyst.status === 'ACTIVE' ? <Unlock size={13} /> : <Lock size={13} />}
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setUserToEdit(analyst); setIsEditModalOpen(true); }}
                                                    className="p-1.5 rounded-md text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 transition-colors"
                                                >
                                                    <Settings size={13} />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); if (analyst.id !== currentUser?.sub) setUserToDelete({ id: analyst.id, name: analyst.name }); }}
                                                    disabled={analyst.id === currentUser?.sub}
                                                    title={analyst.id === currentUser?.sub ? 'Cannot delete self' : 'Delete'}
                                                    className={cn(
                                                        "p-1.5 rounded-md transition-colors",
                                                        analyst.id === currentUser?.sub
                                                            ? "text-slate-700 cursor-not-allowed"
                                                            : "text-slate-500 hover:text-rose-400 hover:bg-rose-500/10"
                                                    )}
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                        </motion.div>
                                    ))
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>

                {/* RIGHT COLUMN (20%) - User Preview Panel */}
                <div className="hidden lg:block h-full min-h-0">
                    <UserPreviewPanel selectedUser={userToEdit || filteredAnalysts[0]} />
                </div>
            </motion.div>
        </div>
    );
};
