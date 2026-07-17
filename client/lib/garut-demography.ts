export const garutDemography: Record<string, string[]> = {
  "Tarogong Kidul": [
    "Pataruman",
    "Sukagalih",
    "Jayawaras",
    "Sukakarya",
    "Sukajaya",
    "Jayaraga",
    "Haurpanggung",
    "Cibunar",
    "Sukabakti",
    "Tarogong",
    "Mekargalih",
    "Kersamenak"
  ],
  "Karangpawitan": [
    "Suci Kaler",
    "Lebakjaya",
    "Karangmulya",
    "Lengkongjaya",
    "Karangpawitan",
    "Situgede",
    "Cimurah",
    "Suci",
    "Jatisari",
    "Godog",
    "Situsari",
    "Karangsari",
    "Sindangpalay",
    "Lebakagung",
    "Sindanggalih",
    "Mekarsari",
    "Sindanglaya",
    "Tanjungsari",
    "Situsaeur",
    "Situjaya"
  ],
  "Garut Kota": [
    "Kota Kulon",
    "Kota Wetan",
    "Margawati",
    "Pakuwon",
    "Muara Sanding",
    "Sukamentri",
    "Ciwalen",
    "Paminggir",
    "Regol",
    "Sukanegla",
    "Cimuncang"
  ],
  "Cilawu": [
    "Cilawu",
    "Sukamukti",
    "Karyamekar",
    "Dawungsari",
    "Pasanggrahan",
    "Sukahati",
    "Mekarsari",
    "Mekarmukti",
    "Desakolot",
    "Ngamplangsari",
    "Margalaksana",
    "Dangiang",
    "Dayeuhmanggung",
    "Sukamaju",
    "Mangurakyat",
    "Ngamplang",
    "Sukatani",
    "Sukamurni"
  ],
  "Bayongbong": [
    "Bayongbong",
    "Panembong",
    "Hegarmanah",
    "Selakuray",
    "Karyajaya",
    "Mulyasari",
    "Pamalayan",
    "Mekarsari",
    "Ciburuy",
    "Ciela",
    "Cikedokan",
    "Banjarsari",
    "Sukasenang",
    "Mekarjaya",
    "Sirnagalih",
    "Sukarame",
    "Cinisti",
    "Sukamanah"
  ],
  "Kota Wetan": [
    "Kota Wetan"
  ],
  "Tarogong Kaler": [
    "Pananjung",
    "Sukajadi",
    "Cimanganten",
    "Jati",
    "Rancabango",
    "Sukawangi",
    "Sirnajaya",
    "Tanjung Kamuning",
    "Mekarjaya",
    "Langensari",
    "Mekarwangi",
    "Pasawahan",
    "Panjiwangi"
  ],
  "Leles": [
    "Leles",
    "Ciburial",
    "Jangkurang",
    "Sukarame",
    "Lembang",
    "Cangkuang",
    "Salamnunggal",
    "Kandangmukti",
    "Margaluyu",
    "Cipancar",
    "Haruman",
    "Dano"
  ],
  "Banyuresmi": [
    "Banyuresmi",
    "Cimareme",
    "Sukaratu",
    "Sukasenang",
    "Sukaraja",
    "Cipicung",
    "Dangdeur",
    "Sukakarya",
    "Pamekarsari",
    "Binakarya",
    "Bagendit",
    "Karyamukti",
    "Karyasari",
    "Sukamukti",
    "Sukalaksana"
  ],
  "Samarang": [
    "Samarang",
    "Cintarakyat",
    "Sukarasa",
    "Parakan",
    "Sukakarya",
    "Cintakarya",
    "Tanjung Karya",
    "Cisarua",
    "Cintarasa",
    "Cintaasih",
    "Sirnasari",
    "Sukalaksana",
    "Tanjunganom"
  ]
};

export const garutDistricts = Object.keys(garutDemography).sort();

export function resolveDistrict(input: string | undefined | null): string {
  if (!input) return "";
  const normalized = input.toLowerCase().trim().replace(/\s+/g, '');
  for (const d of garutDistricts) {
    if (d.toLowerCase().replace(/\s+/g, '') === normalized) return d;
  }
  return "";
}

export function getVillages(districtInput: string | undefined | null): string[] {
  const resolved = resolveDistrict(districtInput);
  return resolved ? garutDemography[resolved] || [] : [];
}
