import { useRef, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Points, PointMaterial } from '@react-three/drei';
import * as THREE from 'three';

// Generates points on a sphere
function generateSpherePoints(count: number, radius: number) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    
    // Slight randomization on radius to give depth
    const r = radius + (Math.random() - 0.5) * 1.5;

    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta); // x
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta); // y
    positions[i * 3 + 2] = r * Math.cos(phi); // z
  }
  return positions;
}

const CyberSphere = ({ count = 3000, radius = 5 }) => {
  const pointsRef = useRef<THREE.Points>(null);
  const { mouse } = useThree();

  // Create points once
  const positions = useMemo(() => generateSpherePoints(count, radius), [count, radius]);

  useFrame((_state, delta) => {
    if (pointsRef.current) {
      // Gentle constant rotation
      pointsRef.current.rotation.y -= delta * 0.05;
      pointsRef.current.rotation.x -= delta * 0.02;

      // Interactive gentle tilt based on mouse position
      // This creates a parallax "floating" feel when hovering your mouse around
      pointsRef.current.rotation.y += (mouse.x * 0.1 - pointsRef.current.rotation.y) * 0.02;
      pointsRef.current.rotation.x += (-mouse.y * 0.1 - pointsRef.current.rotation.x) * 0.02;
    }
  });

  return (
    <group rotation={[0, 0, Math.PI / 4]}>
      <Points ref={pointsRef} positions={positions} stride={3} frustumCulled={false}>
        <PointMaterial
          transparent
          color="#22d3ee" // cyan-400
          size={0.03}
          sizeAttenuation={true}
          depthWrite={false}
          opacity={0.6}
        />
      </Points>
    </group>
  );
};

export const CyberBackground = () => {
  return (
    <div className="absolute inset-0 w-full h-full z-0 pointer-events-auto">
      <Canvas camera={{ position: [0, 0, 7.5], fov: 60 }}>
          {/* Ambient lighting to cast a base glow */}
          <ambientLight intensity={0.5} />
          
          {/* The Data Sphere */}
          <CyberSphere count={5000} radius={6} />
          
          {/* A second, sparser outer shell of points (e.g. "nodes") */}
          <CyberSphere count={1500} radius={8.5} />
      </Canvas>
    </div>
  );
};
