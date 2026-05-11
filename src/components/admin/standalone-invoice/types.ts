export type ItemCategory = 'BOARDING' | 'PET_TAXI' | 'GROOMING' | 'PRODUCT' | 'OTHER';

export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  category: ItemCategory;
  productId?: string;
}

export interface CatalogProduct {
  id: string;
  name: string;
  brand: string | null;
  price: number;
  stock: number;
  available: boolean;
}

export interface QuickAddPreset {
  labelFr: string;
  labelEn: string;
  descriptionFr: string;
  descriptionEn: string;
  serviceType: string;
  category: ItemCategory;
  defaultPrice: number;
  color: string;
}

export const CATEGORY_OPTIONS: { value: ItemCategory; label: string }[] = [
  { value: 'BOARDING', label: '🏠 Pension' },
  { value: 'PET_TAXI', label: '🚗 Pet Taxi' },
  { value: 'GROOMING', label: '✂️ Toilettage / Soins' },
  { value: 'PRODUCT',  label: '🐾 Croquettes / Produits' },
  { value: 'OTHER',    label: '➕ Autre' },
];

export const SERVICE_TYPES = [
  { value: '', fr: '— Multiple / Divers', en: '— Multiple / Miscellaneous' },
  { value: 'BOARDING', fr: 'Pension', en: 'Boarding' },
  { value: 'PET_TAXI', fr: 'Taxi animalier', en: 'Pet Taxi' },
  { value: 'GROOMING', fr: 'Toilettage', en: 'Grooming' },
  { value: 'PRODUCT_SALE', fr: 'Vente produit / Croquettes', en: 'Product Sale / Croquettes' },
];

export const QUICK_ADD_PRESETS: QuickAddPreset[] = [
  {
    labelFr: 'Pension (à saisir)',
    labelEn: 'Boarding (enter price)',
    descriptionFr: 'Pension (nuit)',
    descriptionEn: 'Boarding (night)',
    serviceType: 'BOARDING',
    category: 'BOARDING',
    defaultPrice: 0,
    color: 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100',
  },
  {
    labelFr: 'Pet Taxi',
    labelEn: 'Pet Taxi',
    descriptionFr: 'Pet Taxi',
    descriptionEn: 'Pet Taxi',
    serviceType: 'PET_TAXI',
    category: 'PET_TAXI',
    defaultPrice: 150,
    color: 'bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100',
  },
  {
    labelFr: 'Toilettage',
    labelEn: 'Grooming',
    descriptionFr: 'Toilettage',
    descriptionEn: 'Grooming',
    serviceType: 'GROOMING',
    category: 'GROOMING',
    defaultPrice: 0,
    color: 'bg-purple-50 border-purple-200 text-purple-800 hover:bg-purple-100',
  },
  {
    labelFr: 'Croquettes',
    labelEn: 'Kibbles',
    descriptionFr: 'Croquettes',
    descriptionEn: 'Kibbles',
    serviceType: 'PRODUCT_SALE',
    category: 'PRODUCT',
    defaultPrice: 0,
    color: 'bg-green-50 border-green-200 text-green-800 hover:bg-green-100',
  },
  {
    labelFr: 'Médicaments',
    labelEn: 'Medication',
    descriptionFr: 'Médicaments / soins',
    descriptionEn: 'Medication / care',
    serviceType: '',
    category: 'GROOMING',
    defaultPrice: 0,
    color: 'bg-red-50 border-red-200 text-red-800 hover:bg-red-100',
  },
  {
    labelFr: 'Autre',
    labelEn: 'Other',
    descriptionFr: '',
    descriptionEn: '',
    serviceType: '',
    category: 'OTHER',
    defaultPrice: 0,
    color: 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100',
  },
];

export const PAYMENT_METHODS = [
  { value: 'CASH', fr: 'Espèces', en: 'Cash' },
  { value: 'CARD', fr: 'Carte', en: 'Card' },
  { value: 'CHECK', fr: 'Chèque', en: 'Check' },
  { value: 'TRANSFER', fr: 'Virement', en: 'Transfer' },
];

export const autoCategory = (desc: string): ItemCategory => {
  const d = desc.toLowerCase();
  if (d.includes('pension') || d.includes('nuit') || d.includes('hébergement')) return 'BOARDING';
  if (d.includes('taxi') || d.includes('transport') || d.includes('aller') || d.includes('retour')) return 'PET_TAXI';
  if (d.includes('toilettage') || d.includes('soin') || d.includes('médic') || d.includes('bain') || d.includes('coupe')) return 'GROOMING';
  if (d.includes('croquette') || d.includes('kibble') || d.includes('royal') || d.includes('grain') || d.includes('lamb') || d.includes('nourriture')) return 'PRODUCT';
  return 'OTHER';
};

export const today = () => new Date().toISOString().split('T')[0];
