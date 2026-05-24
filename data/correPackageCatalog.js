export const CORRE_PACKAGES = Object.freeze([
  {
    id: 'corre_10_brl_099',
    name: 'Pacote Relâmpago de Corres',
    description: '10 Corres para colocar a atividade na rua no Giro no Asfalto.',
    correAmount: 10,
    price: 0.99,
    currency: 'BRL',
    featured: true,
    highlightLabel: 'OFERTA DE TESTE',
  },
]);

export function getCorrePackage(packageId) {
  const id = String(packageId || '').trim();
  return CORRE_PACKAGES.find((item) => item.id === id) || CORRE_PACKAGES[0];
}

export function listCorrePackages() {
  return CORRE_PACKAGES.map((item) => ({ ...item }));
}
