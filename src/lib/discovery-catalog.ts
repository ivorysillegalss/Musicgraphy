export type DiscoveryAlbum = {
  id: string;
  albumTitle: string;
  artistName: string;
  releaseYear: number;
  countryCode: string;
  countryName: string;
  cityName: string;
  regionCode?: string | null;
  regionName?: string | null;
  geoGranularity?: "city" | "region" | "country";
  geoClusterKey?: string;
  coordinates: {
    lng: number;
    lat: number;
  };
};

export const DISCOVERY_ALBUM_CATALOG: DiscoveryAlbum[] = [
  { id: "jp-first-love", albumTitle: "First Love", artistName: "Utada Hikaru", releaseYear: 1999, countryCode: "JP", countryName: "Japan", cityName: "Tokyo", coordinates: { lng: 139.6917, lat: 35.6895 } },
  { id: "kr-modern-times", albumTitle: "Modern Times", artistName: "IU", releaseYear: 2013, countryCode: "KR", countryName: "South Korea", cityName: "Seoul", coordinates: { lng: 126.978, lat: 37.5665 } },
  { id: "cn-black-panther", albumTitle: "Black Panther", artistName: "Black Panther", releaseYear: 1992, countryCode: "CN", countryName: "China", cityName: "Beijing", coordinates: { lng: 116.4074, lat: 39.9042 } },
  { id: "tw-jay-fantasy", albumTitle: "Fantasy", artistName: "Jay Chou", releaseYear: 2001, countryCode: "TW", countryName: "Taiwan", cityName: "Taipei", coordinates: { lng: 121.5654, lat: 25.033 } },
  { id: "sg-wardah", albumTitle: "Things We Do For Love", artistName: "Wakin Chau", releaseYear: 1993, countryCode: "SG", countryName: "Singapore", cityName: "Singapore", coordinates: { lng: 103.8198, lat: 1.3521 } },
  { id: "th-bodyslam", albumTitle: "Believe", artistName: "Bodyslam", releaseYear: 2005, countryCode: "TH", countryName: "Thailand", cityName: "Bangkok", coordinates: { lng: 100.5018, lat: 13.7563 } },
  { id: "vn-son-tung", albumTitle: "M-TP m-TP", artistName: "Sơn Tùng M-TP", releaseYear: 2017, countryCode: "VN", countryName: "Vietnam", cityName: "Ho Chi Minh City", coordinates: { lng: 106.6297, lat: 10.8231 } },
  { id: "id-dewa", albumTitle: "Bintang Lima", artistName: "Dewa 19", releaseYear: 2000, countryCode: "ID", countryName: "Indonesia", cityName: "Jakarta", coordinates: { lng: 106.8456, lat: -6.2088 } },
  { id: "my-yuna", albumTitle: "Nocturnal", artistName: "Yuna", releaseYear: 2013, countryCode: "MY", countryName: "Malaysia", cityName: "Kuala Lumpur", coordinates: { lng: 101.6869, lat: 3.139 } },
  { id: "in-aashiqui-2", albumTitle: "Aashiqui 2", artistName: "Mithoon", releaseYear: 2013, countryCode: "IN", countryName: "India", cityName: "Mumbai", coordinates: { lng: 72.8777, lat: 19.076 } },
  { id: "pk-vital-signs", albumTitle: "Vital Signs 1", artistName: "Vital Signs", releaseYear: 1987, countryCode: "PK", countryName: "Pakistan", cityName: "Lahore", coordinates: { lng: 74.3587, lat: 31.5204 } },
  { id: "au-back-in-black", albumTitle: "Back in Black", artistName: "AC/DC", releaseYear: 1980, countryCode: "AU", countryName: "Australia", cityName: "Sydney", coordinates: { lng: 151.2093, lat: -33.8688 } },
  { id: "nz-pure-heroine", albumTitle: "Pure Heroine", artistName: "Lorde", releaseYear: 2013, countryCode: "NZ", countryName: "New Zealand", cityName: "Auckland", coordinates: { lng: 174.7633, lat: -36.8485 } },
  { id: "us-thriller", albumTitle: "Thriller", artistName: "Michael Jackson", releaseYear: 1982, countryCode: "US", countryName: "United States", cityName: "Los Angeles", coordinates: { lng: -118.2437, lat: 34.0522 } },
  { id: "us-1989", albumTitle: "1989", artistName: "Taylor Swift", releaseYear: 2014, countryCode: "US", countryName: "United States", cityName: "New York", coordinates: { lng: -74.006, lat: 40.7128 } },
  { id: "ca-views", albumTitle: "Views", artistName: "Drake", releaseYear: 2016, countryCode: "CA", countryName: "Canada", cityName: "Toronto", coordinates: { lng: -79.3832, lat: 43.6532 } },
  { id: "mx-amor-prohibido", albumTitle: "Amor Prohibido", artistName: "Selena", releaseYear: 1994, countryCode: "MX", countryName: "Mexico", cityName: "Monterrey", coordinates: { lng: -100.3161, lat: 25.6866 } },
  { id: "br-tropicalia", albumTitle: "Tropicália", artistName: "Caetano Veloso", releaseYear: 1968, countryCode: "BR", countryName: "Brazil", cityName: "Rio de Janeiro", coordinates: { lng: -43.1729, lat: -22.9068 } },
  { id: "ar-bocanada", albumTitle: "Bocanada", artistName: "Gustavo Cerati", releaseYear: 1999, countryCode: "AR", countryName: "Argentina", cityName: "Buenos Aires", coordinates: { lng: -58.3816, lat: -34.6037 } },
  { id: "cl-corazones", albumTitle: "Corazones", artistName: "Los Prisioneros", releaseYear: 1990, countryCode: "CL", countryName: "Chile", cityName: "Santiago", coordinates: { lng: -70.6693, lat: -33.4489 } },
  { id: "co-fijacion", albumTitle: "Fijación Oral", artistName: "Shakira", releaseYear: 2005, countryCode: "CO", countryName: "Colombia", cityName: "Barranquilla", coordinates: { lng: -74.7813, lat: 10.9685 } },
  { id: "pe-chabuca", albumTitle: "Lo Mejor de Chabuca", artistName: "Chabuca Granda", releaseYear: 1987, countryCode: "PE", countryName: "Peru", cityName: "Lima", coordinates: { lng: -77.0428, lat: -12.0464 } },
  { id: "de-autobahn", albumTitle: "Autobahn", artistName: "Kraftwerk", releaseYear: 1974, countryCode: "DE", countryName: "Germany", cityName: "Dusseldorf", coordinates: { lng: 6.7735, lat: 51.2277 } },
  { id: "fr-random-access", albumTitle: "Random Access Memories", artistName: "Daft Punk", releaseYear: 2013, countryCode: "FR", countryName: "France", cityName: "Paris", coordinates: { lng: 2.3522, lat: 48.8566 } },
  { id: "uk-ok-computer", albumTitle: "OK Computer", artistName: "Radiohead", releaseYear: 1997, countryCode: "GB", countryName: "United Kingdom", cityName: "London", coordinates: { lng: -0.1276, lat: 51.5072 } },
  { id: "ie-the-joshua-tree", albumTitle: "The Joshua Tree", artistName: "U2", releaseYear: 1987, countryCode: "IE", countryName: "Ireland", cityName: "Dublin", coordinates: { lng: -6.2603, lat: 53.3498 } },
  { id: "es-el-mal-querer", albumTitle: "El Mal Querer", artistName: "Rosalía", releaseYear: 2018, countryCode: "ES", countryName: "Spain", cityName: "Barcelona", coordinates: { lng: 2.1734, lat: 41.3851 } },
  { id: "it-romanzo", albumTitle: "Romanzo Criminale", artistName: "Negramaro", releaseYear: 2007, countryCode: "IT", countryName: "Italy", cityName: "Rome", coordinates: { lng: 12.4964, lat: 41.9028 } },
  { id: "pt-mariza", albumTitle: "Fado em Mim", artistName: "Mariza", releaseYear: 2001, countryCode: "PT", countryName: "Portugal", cityName: "Lisbon", coordinates: { lng: -9.1393, lat: 38.7223 } },
  { id: "nl-golden-earring", albumTitle: "Moontan", artistName: "Golden Earring", releaseYear: 1973, countryCode: "NL", countryName: "Netherlands", cityName: "The Hague", coordinates: { lng: 4.3007, lat: 52.0705 } },
  { id: "be-stromae", albumTitle: "Racine Carrée", artistName: "Stromae", releaseYear: 2013, countryCode: "BE", countryName: "Belgium", cityName: "Brussels", coordinates: { lng: 4.3517, lat: 50.8503 } },
  { id: "se-robyn", albumTitle: "Body Talk", artistName: "Robyn", releaseYear: 2010, countryCode: "SE", countryName: "Sweden", cityName: "Stockholm", coordinates: { lng: 18.0686, lat: 59.3293 } },
  { id: "no-a-ha", albumTitle: "Hunting High and Low", artistName: "a-ha", releaseYear: 1985, countryCode: "NO", countryName: "Norway", cityName: "Oslo", coordinates: { lng: 10.7522, lat: 59.9139 } },
  { id: "fi-nightwish", albumTitle: "Once", artistName: "Nightwish", releaseYear: 2004, countryCode: "FI", countryName: "Finland", cityName: "Helsinki", coordinates: { lng: 24.9384, lat: 60.1699 } },
  { id: "dk-mew", albumTitle: "And the Glass Handed Kites", artistName: "Mew", releaseYear: 2005, countryCode: "DK", countryName: "Denmark", cityName: "Copenhagen", coordinates: { lng: 12.5683, lat: 55.6761 } },
  { id: "pl-hey", albumTitle: "Miłość! Uwaga! Ratunku! Pomocy!", artistName: "Hey", releaseYear: 2009, countryCode: "PL", countryName: "Poland", cityName: "Warsaw", coordinates: { lng: 21.0122, lat: 52.2297 } },
  { id: "cz-lenka", albumTitle: "Lenka Dusilová", artistName: "Lenka Dusilová", releaseYear: 2000, countryCode: "CZ", countryName: "Czechia", cityName: "Prague", coordinates: { lng: 14.4378, lat: 50.0755 } },
  { id: "at-falco", albumTitle: "Falco 3", artistName: "Falco", releaseYear: 1985, countryCode: "AT", countryName: "Austria", cityName: "Vienna", coordinates: { lng: 16.3738, lat: 48.2082 } },
  { id: "ch-yello", albumTitle: "Stella", artistName: "Yello", releaseYear: 1985, countryCode: "CH", countryName: "Switzerland", cityName: "Zurich", coordinates: { lng: 8.5417, lat: 47.3769 } },
  { id: "gr-vissi", albumTitle: "Kravgi", artistName: "Anna Vissi", releaseYear: 2000, countryCode: "GR", countryName: "Greece", cityName: "Athens", coordinates: { lng: 23.7275, lat: 37.9838 } },
  { id: "tr-tarkan", albumTitle: "Ölürüm Sana", artistName: "Tarkan", releaseYear: 1997, countryCode: "TR", countryName: "Turkey", cityName: "Istanbul", coordinates: { lng: 28.9784, lat: 41.0082 } },
  { id: "ru-kino", albumTitle: "Gruppa Krovi", artistName: "Kino", releaseYear: 1988, countryCode: "RU", countryName: "Russia", cityName: "Saint Petersburg", coordinates: { lng: 30.3351, lat: 59.9343 } },
  { id: "ua-okean-elzy", albumTitle: "Gloria", artistName: "Okean Elzy", releaseYear: 2005, countryCode: "UA", countryName: "Ukraine", cityName: "Kyiv", coordinates: { lng: 30.5234, lat: 50.4501 } },
  { id: "za-graceland", albumTitle: "Graceland", artistName: "Paul Simon", releaseYear: 1986, countryCode: "ZA", countryName: "South Africa", cityName: "Johannesburg", coordinates: { lng: 28.0473, lat: -26.2041 } },
  { id: "ng-burna", albumTitle: "African Giant", artistName: "Burna Boy", releaseYear: 2019, countryCode: "NG", countryName: "Nigeria", cityName: "Lagos", coordinates: { lng: 3.3792, lat: 6.5244 } },
  { id: "eg-amr-diab", albumTitle: "Tamally Ma'ak", artistName: "Amr Diab", releaseYear: 2000, countryCode: "EG", countryName: "Egypt", cityName: "Cairo", coordinates: { lng: 31.2357, lat: 30.0444 } },
  { id: "ma-nass-el-ghiwane", albumTitle: "Essaouira", artistName: "Nass El Ghiwane", releaseYear: 1978, countryCode: "MA", countryName: "Morocco", cityName: "Casablanca", coordinates: { lng: -7.5898, lat: 33.5731 } },
  { id: "ke-sauti-sol", albumTitle: "Live and Die in Afrika", artistName: "Sauti Sol", releaseYear: 2015, countryCode: "KE", countryName: "Kenya", cityName: "Nairobi", coordinates: { lng: 36.8219, lat: -1.2921 } },
  { id: "gh-sarkodie", albumTitle: "Highest", artistName: "Sarkodie", releaseYear: 2017, countryCode: "GH", countryName: "Ghana", cityName: "Accra", coordinates: { lng: -0.187, lat: 5.6037 } },
  { id: "et-teddy", albumTitle: "Tikur Sew", artistName: "Teddy Afro", releaseYear: 2012, countryCode: "ET", countryName: "Ethiopia", cityName: "Addis Ababa", coordinates: { lng: 38.7578, lat: 8.9806 } },
  { id: "sa-abdulmajeed", albumTitle: "Waad", artistName: "Abdul Majeed Abdullah", releaseYear: 2008, countryCode: "SA", countryName: "Saudi Arabia", cityName: "Riyadh", coordinates: { lng: 46.6753, lat: 24.7136 } },
  { id: "ae-hussain", albumTitle: "Ana Al Majeed", artistName: "Hussain Al Jassmi", releaseYear: 2011, countryCode: "AE", countryName: "United Arab Emirates", cityName: "Dubai", coordinates: { lng: 55.2708, lat: 25.2048 } },
  { id: "ir-googoosh", albumTitle: "Zartosht", artistName: "Googoosh", releaseYear: 2000, countryCode: "IR", countryName: "Iran", cityName: "Tehran", coordinates: { lng: 51.389, lat: 35.6892 } },
  { id: "il-ivri", albumTitle: "Ha'isha Sheiti", artistName: "Ivri Lider", releaseYear: 2011, countryCode: "IL", countryName: "Israel", cityName: "Tel Aviv", coordinates: { lng: 34.7818, lat: 32.0853 } },
];
