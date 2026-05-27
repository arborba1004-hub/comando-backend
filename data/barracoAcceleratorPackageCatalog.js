export const BARRACO_ACCELERATOR_PACKAGE_CATALOG = [
  {
    id: 'barraco_accel_20x2h_099',
    name: 'Pacote Obra Relâmpago',
    description: '20 aceleradores de 2 horas para reduzir o tempo de evolução do barraco.',
    acceleratorCount: 20,
    secondsPerAccelerator: 2 * 60 * 60,
    totalSeconds: 20 * 2 * 60 * 60,
    price: 0.99,
    currency: 'BRL',
    featured: true,
    badge: 'OBRA EXPRESSA',
  },
];

export const BARRACO_ACCELERATOR_PACKAGE_BY_ID = BARRACO_ACCELERATOR_PACKAGE_CATALOG.reduce((acc, item) => {
  acc[item.id] = item;
  return acc;
}, {});

export function getBarracoAcceleratorPackage(packageId = 'barraco_accel_20x2h_099') {
  const id = String(packageId || 'barraco_accel_20x2h_099').trim();
  return BARRACO_ACCELERATOR_PACKAGE_BY_ID[id] || null;
}
