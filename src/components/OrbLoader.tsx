import React from 'react';
import './OrbLoader.css';

const OrbLoader: React.FC<{ size?: number; maskId?: string }> = ({ size = 1, maskId = 'orb-clipping' }) => {
  return (
    <div className="orb-loader-wrapper" style={{ '--size': size } as React.CSSProperties}>
      <div className="loader">
        <svg width={100} height={100} viewBox="0 0 100 100">
          <defs>
            <mask id={maskId} className="orb-mask">
              <polygon points="0,0 100,0 100,100 0,100" fill="black" />
              <polygon points="25,25 75,25 50,75" fill="white" />
              <polygon points="50,25 75,75 25,75" fill="white" />
              <polygon points="35,35 65,35 50,65" fill="white" />
              <polygon points="35,35 65,35 50,65" fill="white" />
              <polygon points="35,35 65,35 50,65" fill="white" />
              <polygon points="35,35 65,35 50,65" fill="white" />
            </mask>
          </defs>
        </svg>
        <div className="box" style={{ mask: `url(#${maskId})`, WebkitMask: `url(#${maskId})` }} />

      </div>
    </div>
  );
}

export default OrbLoader;
