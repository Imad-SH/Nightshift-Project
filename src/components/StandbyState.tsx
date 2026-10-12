import React from 'react';
export const StandbyState: React.FC = () => {
    return (
        <div className="glass-panel flex flex-col items-center justify-center h-full w-full select-none relative overflow-hidden">
            {/* The Text */}
            <div className="flex items-center gap-2 opacity-100">
                <span className="text-cyan-600 text-lg font-light animate-pulse">[</span>
                <p className="font-mono text-xs text-cyan-500 tracking-[0.2em] uppercase pl-[0.2em] text-center relative top-[1px]">
                    SELECT AN ALERT
                </p>
                <span className="text-cyan-600 text-lg font-light animate-pulse">]</span>
            </div>
        </div>
    );
};
