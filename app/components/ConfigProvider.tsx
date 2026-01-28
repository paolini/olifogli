"use client"
import React, { createContext, useContext, ReactNode } from 'react';

interface Config {
  serverName: string;
  serverBackgroundColor?: string;
  appInstance?: string;
}

const ConfigContext = createContext<Config>({
  serverName: "Olifogli",
});

export const useConfig = () => useContext(ConfigContext);

export const ConfigProvider = ({ 
  children, 
  serverName, 
  serverBackgroundColor, 
  appInstance 
}: { 
  children: ReactNode 
} & Config) => {
  return (
    <ConfigContext.Provider value={{ serverName, serverBackgroundColor, appInstance }}>
      {children}
    </ConfigContext.Provider>
  );
};
