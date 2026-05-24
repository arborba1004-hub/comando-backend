export const CORRE_PACKAGE_CATALOG = [
  {
    id: 'corre_10_099',
    name: 'Pacote Relâmpago de Corres',
    description: '10 Corres para rodar no Giro no Asfalto e manter o movimento sem gastar Commands.',
    correAmount: 10,
    price: 0.99,
    currency: 'BRL',
    featured: true,
    badge: 'OFERTA DE ENTRADA',
  },
];

export const CORRE_PACKAGE_BY_ID = CORRE_PACKAGE_CATALOG.reduce((acc, item) => {
  acc[item.id] = item;
  return acc;
}, {});

export function getCorrePackage(packageId = 'corre_10_099') {
  const id = String(packageId || 'corre_10_099').trim();
  return CORRE_PACKAGE_BY_ID[id] || null;
}
