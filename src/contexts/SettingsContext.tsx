import React, { createContext, useContext, useEffect, useState } from 'react';
import { useSocAuth } from './AuthContext';

interface SettingsContextType {
    settings: Record<string, any>;
    customLogo: string | null;
    updateSetting: (key: string, value: any) => Promise<void>;
    isLoading: boolean;
}

const SettingsContext = createContext<SettingsContextType>({
    settings: {},
    customLogo: null,
    updateSetting: async () => {},
    isLoading: true,
});

export const useSettings = () => useContext(SettingsContext);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { token } = useSocAuth();
    const [settings, setSettings] = useState<Record<string, any>>({});
    const [isLoading, setIsLoading] = useState(true);

    const fetchSettings = async () => {
        if (!token) return;
        try {
            const response = await fetch(`http://${window.location.hostname}:8000/api/settings/`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setSettings(data);
            }
        } catch (err) {
            console.error("❌ [SettingsContext] Error fetching settings:", err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (token) fetchSettings();
    }, [token]);

    const updateSetting = async (key: string, value: any) => {
        if (!token) return;
        try {
            const response = await fetch(`http://${window.location.hostname}:8000/api/settings/`, {
                method: 'PATCH',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ key, value })
            });
            if (response.ok) {
                setSettings(prev => ({ ...prev, [key]: value }));
            }
        } catch (err) {
            console.error(`❌ [SettingsContext] Error updating setting ${key}:`, err);
            throw err;
        }
    };

    const value = {
        settings,
        customLogo: settings.custom_logo || null,
        updateSetting,
        isLoading,
    };

    return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
};
