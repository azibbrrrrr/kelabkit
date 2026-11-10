// Curated emoji for collection icons, bundled locally (no CDN, no emoji dependency). Each
// line is "<emoji> <name> <keywords…>": the first word (hyphens read as spaces) is the
// Bahasa Melayu name used as the button's accessible label; the rest are BM and English
// search keywords. Order inside a category is the order shown in the picker.

export type EmojiCategoryId = "makanan" | "pakaian" | "sambutan" | "wang" | "sekolah" | "sukan" | "perjalanan" | "alam";

export type EmojiEntry = {
  emoji: string;
  /** Accessible name in Bahasa Melayu, e.g. "Pinggan". */
  name: string;
  /** Lower-case search words, BM and English, the name's words included. */
  keywords: string[];
  category: EmojiCategoryId;
};

export type EmojiCategory = { id: EmojiCategoryId; label: string; emoji: string };

export const emojiCategories: EmojiCategory[] = [
  { id: "makanan", label: "Makanan & minuman", emoji: "🍽️" },
  { id: "pakaian", label: "Pakaian", emoji: "👕" },
  { id: "sambutan", label: "Hadiah & sambutan", emoji: "🎁" },
  { id: "wang", label: "Wang & urusan", emoji: "💰" },
  { id: "sekolah", label: "Sekolah & pendidikan", emoji: "🏫" },
  { id: "sukan", label: "Sukan & aktiviti", emoji: "⚽" },
  { id: "perjalanan", label: "Perjalanan", emoji: "✈️" },
  { id: "alam", label: "Alam & simbol", emoji: "🌸" },
];

const raw: Record<EmojiCategoryId, string> = {
  makanan: `
🍽️ pinggan makan jamuan kenduri food plate dinner meal
🍚 nasi rice makan food
🍛 kari nasi curry rice makan food
🍜 mi mee noodle soup makan
🍲 sup soup stew periuk makan
🍗 ayam chicken drumstick makan bbq
🍖 daging meat bbq makan
🍢 sate satay makan
🍤 udang prawn shrimp makan
🥘 lauk gulai masakan dish makan
🍱 bekal bento lunch box makan
🥪 sandwic sandwich roti bread
🍞 roti bread sarapan breakfast
🥐 pastri croissant pastry sarapan
🍰 kek cake dessert pencuci mulut
🎂 hari-jadi kek birthday cake sambutan
🧁 kek-cawan cupcake kuih
🍩 donut doughnut kuih
🍪 biskut cookie biscuit kuih raya
🍫 coklat chocolate
🍬 gula-gula candy sweet
🍦 aiskrim ice cream
🍉 tembikai watermelon buah fruit
🍌 pisang banana buah fruit
🥭 mangga mango buah fruit
🍎 epal apple buah fruit
🥥 kelapa coconut buah
☕ kopi coffee minum drink
🍵 teh tea minum drink
🧋 teh-boba bubble tea minum drink
🥤 air minuman drink cup soda
🧃 jus juice kotak minum drink
🍹 mocktail minuman drink parti party`,
  pakaian: `
👕 baju tshirt t-shirt kemeja jersi shirt
👔 kemeja shirt tie tali leher formal
👚 blaus blouse baju wanita
👗 gaun dress baju
🥻 sari saree baju
👘 kimono baju
🧥 kot coat jaket jacket
🦺 rompi vest jaket keselamatan safety
👖 seluar jeans pants trousers
🩳 seluar-pendek shorts sukan
🧢 topi cap hat
👒 topi-wanita hat
🎩 topi-tinggi top hat majlis
🧣 skarf scarf selendang tudung
🧤 sarung-tangan gloves
🧦 stoking socks
👟 kasut-sukan sneaker shoe running
👞 kasut shoe formal
👠 kasut-tumit heels shoe
🎒 beg-sekolah backpack bag
👜 beg-tangan handbag bag
👛 dompet purse wallet
🕶️ cermin-mata-hitam sunglasses
👓 cermin-mata glasses spectacles
⌚ jam-tangan watch
💍 cincin ring kahwin wedding
🎽 jersi jersey singlet sukan running`,
  sambutan: `
🎁 hadiah gift present persaraan retirement cenderahati
🎉 sambutan party celebration parti meriah
🎊 konfeti confetti sambutan celebration
🎈 belon balloon parti party
🎀 reben ribbon hadiah gift
🥳 parti party celebrate gembira
🪅 pinata party parti
🎆 bunga-api fireworks merdeka
🎇 percikan sparkler bunga api
🧧 angpau ang pow duit raya red packet tahun baru cina cny
🏮 tanglung lantern cny
🕌 masjid mosque surau raya
🌙 bulan moon raya ramadan puasa
🪔 pelita diya deepavali lamp
🎄 pokok-krismas christmas tree
🇲🇾 malaysia bendera flag merdeka
💐 jambangan bouquet bunga flowers hadiah
🌹 mawar rose bunga
🏆 trofi trophy anugerah award juara
🥇 pingat-emas gold medal juara
🎖️ pingat medal anugerah
📜 sijil certificate scroll
💌 kad-ucapan card surat letter
✉️ sampul envelope surat letter
🙏 terima-kasih thank you doa pray
👏 tepukan clap applause tahniah
🤝 kebajikan sumbangan handshake kerjasama charity welfare
❤️ kasih love sayang heart
💝 hati-hadiah heart gift kasih`,
  wang: `
💰 yuran duit wang money bag fee
💵 duit-kertas cash wang money ringgit
🪙 syiling coin duit wang
💳 kad-bank card bank debit kredit
🏦 bank bank
🧾 resit receipt bayaran invoice
💸 belanja spend duit expense
🤑 untung money rich
🐷 tabung piggy savings simpanan
📈 naik chart growth graf
📉 turun chart loss graf
📊 laporan report chart graf statistik
📋 senarai clipboard list checklist
🗂️ fail folder files
📁 folder fail
📅 kalendar calendar tarikh date
🗓️ jadual schedule calendar
⏰ jam alarm masa time
⏳ tempoh hourglass masa waiting
📌 pin penting pinned
📎 klip paperclip lampiran attachment
✏️ pensel pencil tulis write
🖊️ pen pen tulis
📝 nota memo note catatan minit
📞 telefon phone call
📱 telefon-bimbit phone mobile whatsapp
💼 beg-kerja briefcase business kerja mesyuarat
🏢 pejabat office building
📦 kotak box parcel bungkusan
🔖 tanda bookmark tag`,
  sekolah: `
🏫 sekolah school
👩‍🏫 cikgu-perempuan guru teacher hari wanita
👨‍🏫 cikgu-lelaki guru teacher hari
🧑‍🎓 pelajar student murid graduate
🎓 graduasi graduation konvokesyen
📚 buku books perpustakaan library
📖 buku-terbuka book baca read
📓 buku-nota notebook
📕 buku-teks textbook
🖍️ krayon crayon lukis
🎨 seni art lukisan palette
✂️ gunting scissors kraf craft
📐 sesiku set square matematik
📏 pembaris ruler
🧮 sempoa abacus kira matematik
🔬 mikroskop microscope sains science
🧪 eksperimen sains test tube science
🌍 geografi globe dunia world
🧠 otak brain fikir think
💡 idea mentol lightbulb
🖥️ komputer computer ict
💻 laptop komputer riba
🔔 loceng bell
🧑‍🍳 masakan chef cook masak
🎤 mikrofon mic ucapan speech nyanyi
📣 pengumuman megaphone announce
🗣️ ucapan speak talk
🎭 drama teater theatre
🎼 muzik music skor`,
  sukan: `
⚽ bola-sepak football soccer sukan
🏀 bola-keranjang basketball sukan
🏐 bola-tampar volleyball sukan
🏸 badminton sukan
🏓 ping-pong table tennis sukan
🎾 tenis tennis sukan
🏑 hoki hockey sukan
🏏 kriket cricket sukan
🏃 larian lari run marathon sukan
🚴 basikal cycling kayuh
🏊 renang swim berenang
🧘 yoga senaman exercise
🏋️ angkat-berat gym weight senaman
🥾 mendaki hiking hike
⛺ khemah camp camping perkhemahan
🎣 memancing fishing pancing
🎳 boling bowling
🎯 sasaran target dart matlamat
🎮 permainan game
♟️ catur chess
🧩 teka-teki puzzle
🎶 lagu music nyanyi song karaoke
🎸 gitar guitar muzik
🥁 dram drum kompang
💃 tarian dance menari
🏁 penamat finish race perlumbaan
🤸 gimrama gymnastics`,
  perjalanan: `
✈️ kapal-terbang plane flight lawatan travel
🚌 bas bus rombongan trip lawatan
🚐 van minivan
🚗 kereta car
🚆 kereta-api train
🚢 kapal ship cruise
⛵ bot-layar sailboat
🏖️ pantai beach percutian holiday
🏝️ pulau island percutian holiday
🏔️ gunung mountain
🏕️ perkhemahan camping camp
🗺️ peta map
🧭 kompas compass
🧳 bagasi luggage beg travel
🏨 hotel hotel penginapan
🏠 rumah house home
🏛️ muzium museum
🎡 taman-tema theme park
🎢 rollercoaster taman tema
⛽ minyak fuel petrol
🅿️ parkir parking letak kereta
🚦 lampu-isyarat traffic light
🗼 menara tower
🕋 umrah haji kaabah
🌏 asia dunia world globe
📸 kamera camera gambar photo`,
  alam: `
🌸 bunga flower sakura
🌺 bunga-raya hibiscus malaysia
🌻 bunga-matahari sunflower
🌷 tulip bunga
🌳 pokok tree
🌴 pokok-palma palm tree pantai
🍃 daun leaf hijau
🌱 tunas seedling hijau growth
☀️ cerah sun matahari
🌈 pelangi rainbow
⭐ bintang star
✨ kilauan sparkles
🔥 api fire hot
💧 titisan water air drop
🌧️ hujan rain
🐱 kucing cat
🐶 anjing dog
🐟 ikan fish
🦋 rama-rama butterfly
🐝 lebah bee
✅ selesai done check tick
❗ penting important
❓ soalan question
⚠️ amaran warning
🔴 merah red bulat
🟢 hijau green bulat
🔵 biru blue bulat
💯 seratus hundred perfect
♻️ kitar-semula recycle
🕊️ keamanan peace dove`,
};

function label(word: string) {
  const spaced = word.replace(/-/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export const emojiCatalog: EmojiEntry[] = emojiCategories.flatMap(({ id }) =>
  raw[id]
    .trim()
    .split("\n")
    .map((line) => {
      const [emoji, name, ...rest] = line.trim().split(/\s+/);
      const words = [...name.split("-"), ...rest].map((word) => word.toLowerCase());
      return { emoji, name: label(name), keywords: [...new Set(words)], category: id };
    }),
);

/** Folds case and accents so "Kenduri" and "kénduri" both match. */
function fold(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * Keyword search. Every word in the query must begin some keyword of the entry; entries where
 * more words match a keyword exactly come first, then catalogue order.
 */
export function searchEmoji(query: string, catalog: EmojiEntry[] = emojiCatalog): EmojiEntry[] {
  const terms = fold(query).split(/[\s,]+/).filter(Boolean);
  if (!terms.length) return [];
  const scored: { entry: EmojiEntry; score: number; index: number }[] = [];
  catalog.forEach((entry, index) => {
    let score = 0;
    for (const term of terms) {
      if (entry.keywords.includes(term)) score += 2;
      else if (entry.keywords.some((keyword) => keyword.startsWith(term))) score += 1;
      else return;
    }
    scored.push({ entry, score, index });
  });
  return scored.sort((a, b) => b.score - a.score || a.index - b.index).map((row) => row.entry);
}
