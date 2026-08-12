const PET_PHOTO_OPTIONS = {
  pawBlue: require('../../assets/paw.png'),
  pawWhite: require('../../assets/paw1.png'),
  petBadge: require('../../assets/Pets_Icon.png'),
};

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 25 }, (_, index) => String(CURRENT_YEAR - index));
const OTHER_OPTION_VALUE = '__other__';

const PET_SPECIES_LIBRARY = {
  'Canine (Dog)': {
    breeds: [
      { label: 'Aspin / Mixed Breed', value: 'Aspin / Mixed Breed' },
      { label: 'Beagle', value: 'Beagle' },
      { label: 'Belgian Malinois', value: 'Belgian Malinois' },
      { label: 'Chihuahua', value: 'Chihuahua' },
      { label: 'Corgi', value: 'Corgi', aliases: ['Pembroke Welsh Corgi', 'Cardigan Welsh Corgi'] },
      { label: 'Dachshund', value: 'Dachshund' },
      { label: 'Doberman Pinscher', value: 'Doberman Pinscher' },
      { label: 'French Bulldog', value: 'French Bulldog' },
      { label: 'German Shepherd', value: 'German Shepherd', aliases: ['German Shepherd Dog'] },
      { label: 'Golden Retriever', value: 'Golden Retriever' },
      { label: 'Labrador Retriever', value: 'Labrador Retriever' },
      { label: 'Pomeranian', value: 'Pomeranian' },
      { label: 'Poodle', value: 'Poodle' },
      { label: 'Pug', value: 'Pug' },
      { label: 'Rottweiler', value: 'Rottweiler' },
      { label: 'Shih Tzu', value: 'Shih Tzu' },
      { label: 'Siberian Husky', value: 'Siberian Husky' },
      { label: 'Yorkshire Terrier', value: 'Yorkshire Terrier' },
    ],
  },
  'Feline (Cat)': {
    breeds: [
      { label: 'American Shorthair', value: 'American Shorthair' },
      { label: 'Bengal', value: 'Bengal' },
      { label: 'British Shorthair', value: 'British Shorthair' },
      { label: 'Domestic Shorthair', value: 'Domestic Shorthair' },
      { label: 'Exotic Shorthair', value: 'Exotic Shorthair' },
      { label: 'Maine Coon', value: 'Maine Coon' },
      { label: 'Persian', value: 'Persian', aliases: ['Persian Cat'] },
      { label: 'Ragdoll', value: 'Ragdoll' },
      { label: 'Scottish Fold', value: 'Scottish Fold' },
      { label: 'Siamese', value: 'Siamese', aliases: ['Siamese Cat'] },
      { label: 'Siberian', value: 'Siberian' },
      { label: 'Sphynx', value: 'Sphynx' },
    ],
  },
  Avian: {
    breeds: [
      { label: 'African Grey Parrot', value: 'African Grey Parrot' },
      { label: 'Budgerigar', value: 'Budgerigar' },
      { label: 'Canary', value: 'Canary' },
      { label: 'Cockatiel', value: 'Cockatiel' },
      { label: 'Lovebird', value: 'Lovebird' },
      { label: 'Pigeon', value: 'Pigeon' },
      { label: 'Quail', value: 'Quail' },
    ],
  },
  'Small Mammals': {
    breeds: [
      { label: 'Chinchilla', value: 'Chinchilla' },
      { label: 'Ferret', value: 'Ferret' },
      { label: 'Guinea Pig', value: 'Guinea Pig' },
      { label: 'Hamster', value: 'Hamster' },
      { label: 'Holland Lop', value: 'Holland Lop' },
      { label: 'Netherland Dwarf', value: 'Netherland Dwarf' },
    ],
  },
  'Reptiles and Amphibians': {
    breeds: [
      { label: 'Ball Python', value: 'Ball Python' },
      { label: 'Bearded Dragon', value: 'Bearded Dragon' },
      { label: 'Leopard Gecko', value: 'Leopard Gecko' },
      { label: 'Pacman Frog', value: 'Pacman Frog' },
      { label: 'Red-Eared Slider', value: 'Red-Eared Slider' },
    ],
  },
  Arachnids: {
    breeds: [
      { label: 'Asian Forest Scorpion', value: 'Asian Forest Scorpion' },
      { label: 'Chilean Rose Tarantula', value: 'Chilean Rose Tarantula' },
      { label: 'Emperor Scorpion', value: 'Emperor Scorpion' },
      { label: 'Mexican Redknee Tarantula', value: 'Mexican Redknee Tarantula' },
    ],
  },
  'Aquatic and Marine': {
    breeds: [
      { label: 'Betta', value: 'Betta' },
      { label: 'Clownfish', value: 'Clownfish' },
      { label: 'Goldfish', value: 'Goldfish' },
      { label: 'Guppy', value: 'Guppy' },
      { label: 'Koi', value: 'Koi' },
      { label: 'Oscar', value: 'Oscar' },
    ],
  },
  'Other Mammals': {
    breeds: [
      { label: 'Goat', value: 'Goat' },
      { label: 'Mini Pig', value: 'Mini Pig' },
      { label: 'Monkey', value: 'Monkey' },
      { label: 'Sugar Glider', value: 'Sugar Glider' },
    ],
  },
};

const PET_SPECIES_OPTIONS = Object.keys(PET_SPECIES_LIBRARY);

const INITIAL_PETS = [
  {
    id: 'pet-1',
    referenceCode: 'PET-0001',
    name: 'Bella',
    breed: 'Golden Retriever',
    species: 'Canine (Dog)',
    age: '3',
    birthMonth: 'April',
    birthDay: '14',
    birthYear: '2023',
    weight: '24',
    sex: 'Female',
    color: 'Golden',
    specialMarkings: 'Light cream fur on chest',
    profileColor: '#c7e6f7',
    profileImageKey: 'pawBlue',
    profileImageUri: '',
    medicalHistory: ['Allergy monitoring', 'Routine deworming completed'],
    vaccinations: ['Rabies - Updated', '5-in-1 - Updated'],
    visits: ['Mar 18, 2026 - Wellness check', 'Jan 09, 2026 - Vaccination follow-up'],
  },
  {
    id: 'pet-2',
    referenceCode: 'PET-0002',
    name: 'Max',
    breed: 'Persian',
    species: 'Feline (Cat)',
    age: '2',
    birthMonth: 'September',
    birthDay: '2',
    birthYear: '2024',
    weight: '5',
    sex: 'Male',
    color: 'White',
    specialMarkings: 'Fluffy tail and gray ears',
    profileColor: '#d8eefb',
    profileImageKey: 'pawWhite',
    profileImageUri: '',
    medicalHistory: ['Skin treatment review', 'Ear cleaning record'],
    vaccinations: ['Anti-rabies - Updated', '4-in-1 - Pending booster'],
    visits: ['Feb 14, 2026 - Diagnosis visit', 'Dec 06, 2025 - Grooming consult'],
  },
];

const clonePet = (pet) => ({
  ...pet,
  medicalHistory: [...(pet.medicalHistory || [])],
  vaccinations: [...(pet.vaccinations || [])],
  visits: [...(pet.visits || [])],
});

let petsStore = INITIAL_PETS.map(clonePet);

const buildReferenceCode = (count) => `PET-${String(count + 1).padStart(4, '0')}`;

const formatBirthday = (pet) => {
  if (!pet?.birthMonth || !pet?.birthDay || !pet?.birthYear) {
    return '-';
  }

  return `${pet.birthMonth} ${pet.birthDay}, ${pet.birthYear}`;
};

const getFormattedAgeFromBirthday = (pet) => {
  if (!pet?.birthMonth || !pet?.birthDay || !pet?.birthYear) {
    return '';
  }

  const monthIndex = MONTHS.indexOf(pet.birthMonth);
  if (monthIndex < 0) {
    return '';
  }

  const birthDate = new Date(Number(pet.birthYear), monthIndex, Number(pet.birthDay));
  if (Number.isNaN(birthDate.getTime())) {
    return '';
  }

  const today = new Date();
  let totalMonths =
    (today.getFullYear() - birthDate.getFullYear()) * 12 +
    (today.getMonth() - birthDate.getMonth());

  if (today.getDate() < birthDate.getDate()) {
    totalMonths -= 1;
  }

  totalMonths = Math.max(totalMonths, 0);

  if (totalMonths < 12) {
    return `${totalMonths} month${totalMonths === 1 ? '' : 's'} old`;
  }

  const years = Math.floor(totalMonths / 12);
  return `${years} year${years === 1 ? '' : 's'} old`;
};

const formatAge = (petOrAge) => {
  if (petOrAge && typeof petOrAge === 'object') {
    const computedAge = getFormattedAgeFromBirthday(petOrAge);
    if (computedAge) {
      return computedAge;
    }

    return formatAge(petOrAge.age);
  }

  const age = petOrAge;
  if (!age) {
    return '-';
  }

  const ageNumber = Number(age);
  if (Number.isNaN(ageNumber)) {
    return age;
  }

  return `${ageNumber} year${ageNumber === 1 ? '' : 's'} old`;
};

const getPetPhotoSource = (pet) => {
  if (pet?.profileImageUri) {
    return { source: { uri: pet.profileImageUri }, isCustom: true };
  }

  if (pet?.profileImageKey && PET_PHOTO_OPTIONS[pet.profileImageKey]) {
    return { source: PET_PHOTO_OPTIONS[pet.profileImageKey], isCustom: false };
  }

  return { source: null, isCustom: false };
};

const getSpeciesConfig = (species) => PET_SPECIES_LIBRARY[species] || PET_SPECIES_LIBRARY[PET_SPECIES_OPTIONS[0]];

const findBreedEntry = (species, breedValue) => {
  if (!breedValue) {
    return null;
  }

  const normalizedBreed = breedValue.trim().toLowerCase();

  return getSpeciesConfig(species).breeds.find((breed) => {
    const aliases = breed.aliases || [];
    return [breed.value, ...aliases].some((value) => value.trim().toLowerCase() === normalizedBreed);
  }) || null;
};

const getBreedOptionsForSpecies = (species) => {
  const config = getSpeciesConfig(species);
  return [
    ...config.breeds.map((breed) => ({
      label: breed.label,
      value: breed.value,
    })),
    { label: 'Other', value: OTHER_OPTION_VALUE },
  ];
};

const createBirthdayDefaults = () => {
  const today = new Date();
  return {
    birthMonth: MONTHS[today.getMonth()],
    birthDay: String(today.getDate()),
    birthYear: String(today.getFullYear()),
  };
};

const createEmptyPetDraft = () => ({
  id: `pet-${Date.now()}`,
  referenceCode: buildReferenceCode(petsStore.length),
  name: '',
  breed: '',
  species: PET_SPECIES_OPTIONS[0],
  age: '',
  ...createBirthdayDefaults(),
  weight: '',
  sex: 'Male',
  color: '',
  specialMarkings: '',
  profileColor: '#d8eefb',
  profileImageKey: 'petBadge',
  profileImageUri: '',
  medicalHistory: [],
  vaccinations: [],
  visits: [],
  customBreed: '',
});

const createPetDraftFromPet = (pet) => {
  const fallbackDraft = createEmptyPetDraft();

  if (!pet) {
    return fallbackDraft;
  }

  const species = PET_SPECIES_LIBRARY[pet.species] ? pet.species : fallbackDraft.species;
  const knownBreed = findBreedEntry(species, pet.breed);

  return {
    ...fallbackDraft,
    ...clonePet(pet),
    species,
    age: getFormattedAgeFromBirthday(pet) || String(pet.age || ''),
    customBreed: knownBreed ? '' : (pet.breed || '').trim(),
  };
};

const getAllPets = () => petsStore.map(clonePet);

const getPetById = (petId) => {
  const pet = petsStore.find((item) => item.id === petId);
  return pet ? clonePet(pet) : null;
};

const savePet = (pet) => {
  const species = PET_SPECIES_LIBRARY[pet.species] ? pet.species : PET_SPECIES_OPTIONS[0];
  const normalizedPet = clonePet({
    ...pet,
    species,
    name: (pet.name || '').trim(),
    breed: (pet.breed || '').trim(),
    age: getFormattedAgeFromBirthday(pet) || String(pet.age || '').trim(),
    weight: String(pet.weight || '').replace(/[^0-9.]/g, '').trim(),
  });

  delete normalizedPet.customBreed;

  const existingIndex = petsStore.findIndex((item) => item.id === normalizedPet.id);

  if (existingIndex >= 0) {
    petsStore = petsStore.map((item, index) => (
      index === existingIndex ? normalizedPet : item
    ));
  } else {
    petsStore = [...petsStore, normalizedPet];
  }

  return clonePet(normalizedPet);
};

export {
  MONTHS,
  OTHER_OPTION_VALUE,
  PET_SPECIES_OPTIONS,
  YEARS,
  createEmptyPetDraft,
  createPetDraftFromPet,
  formatAge,
  formatBirthday,
  getAllPets,
  getFormattedAgeFromBirthday,
  getBreedOptionsForSpecies,
  getPetById,
  getPetPhotoSource,
  savePet,
};
