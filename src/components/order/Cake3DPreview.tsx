import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stage, Center } from '@react-three/drei';
import { Suspense } from 'react';

// Props matching the selection state from Order.tsx
interface Cake3DPreviewProps {
  size: string;
  filling: string;
  theme: string;
  dedication?: string;
  attributes?: any[]; // Passed from configurator 
}

// Helper to get colors based on theme/filling
// Ideally this would come from the database/attributes, but hardcoding for demo
const getThemeColors = (theme: string) => {
  switch (theme.toLowerCase()) {
    case 'chocolate': return '#5D4037';
    case 'vanilla': return '#F5F5DC';
    case 'red velvet': return '#9C0000';
    case 'lemon': return '#FFFACD';
    case 'carrot': return '#E67E22';
    default: return '#F5F5DC'; // Default vanilla-ish
  }
};

const getFillingColor = (filling: string) => {
  switch (filling.toLowerCase()) {
    case 'chocolate': return '#3E2723';
    case 'vanilla': return '#FFF8E1';
    case 'strawberry': return '#FFB6C1';
    case 'dulce de leche': return '#C58F58';
    default: return '#FFF8E1';
  }
};

const CakeModel = ({ size, filling, theme }: Cake3DPreviewProps) => {
  // Parse size to get radius/scale. Assuming format like "8-inch", "10 people", etc.
  // We'll use a rough heuristic if specific dimensions aren't available.
  let scale = 1;
  if (size.includes('10')) scale = 1.2;
  if (size.includes('12')) scale = 1.4;
  if (size.includes('6')) scale = 0.8;

  const baseColor = getThemeColors(theme || 'vanilla');
  const fillingColor = getFillingColor(filling || 'vanilla');

  return (
    <group dispose={null} scale={scale}>
      {/* Cake Base */}
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[2, 2, 1, 32]} />
        <meshStandardMaterial color={baseColor} />
      </mesh>

      {/* Filling Layer (Visualized as a thin band in the middle) */}
      <mesh position={[0, 0.5, 0]} scale={[1.01, 0.1, 1.01]}>
        <cylinderGeometry args={[2, 2, 1, 32]} />
        <meshStandardMaterial color={fillingColor} />
      </mesh>

      {/* Top Icing/Decor */}
      <mesh position={[0, 1.05, 0]}>
        <cylinderGeometry args={[1.9, 2.0, 0.1, 32]} />
        <meshStandardMaterial color={baseColor} roughness={0.3} />
      </mesh>

      {/* Simple decoration spheres on top */}
      {Array.from({ length: 8 }).map((_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        const x = Math.cos(angle) * 1.6;
        const z = Math.sin(angle) * 1.6;
        return (
          <mesh key={i} position={[x, 1.15, z]}>
            <sphereGeometry args={[0.15, 16, 16]} />
            <meshStandardMaterial color={fillingColor} />
          </mesh>
        );
      })}
    </group>
  );
};

export default function Cake3DPreview(props: Cake3DPreviewProps) {
  return (
    <div className="h-full w-full bg-gradient-to-b from-gray-50 to-gray-100 rounded-lg overflow-hidden relative">
      <Canvas shadows camera={{ position: [4, 4, 7], fov: 45 }}>
        <ambientLight intensity={0.7} />
        <pointLight position={[10, 10, 10]} intensity={1.5} castShadow />
        <Suspense fallback={null}>
          <group position={[0, -1, 0]}>
            <CakeModel {...props} />
          </group>
          <OrbitControls makeDefault autoRotate autoRotateSpeed={2} minPolarAngle={0} maxPolarAngle={Math.PI / 1.75} />
        </Suspense>
      </Canvas>
      <div className="absolute bottom-2 left-0 right-0 text-center pointer-events-none">
        <span className="text-xs text-muted-foreground bg-white/80 px-2 py-1 rounded-full">
          Drag to rotate • Pinch to zoom
        </span>
      </div>
    </div>
  );
}
