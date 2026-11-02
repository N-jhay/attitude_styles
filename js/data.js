// ---- Edit everything in this file to update the store. ----
// Reload the page (or refresh your VS Code Live Server tab) to see changes.
// Product photos live in assets/products/ — swap the files and keep the same names,
// or point "img" at a new filename.

const TOP_DIMS = {
  S: "Chest 50 x Length 69 cm",
  M: "Chest 52 x Length 71 cm",
  L: "Chest 55 x Length 73 cm",
  XL: "Chest 58 x Length 75 cm",
  XXL: "Chest 61 x Length 77 cm",
};
const CAP_DIMS = { "One size": "Fits 54-60 cm head" };

window.STORE_DATA = {
  whatsapp: "2347063972297", // digits only, country code, no +
  tagline: "Streetwear built on confidence. Limited drops, made for people who carry their own crown.",
  about: {
    title: "The Standard",
    body: "Attitude Styles is a streetwear label for people who move with intention. Every crest-marked piece is made in small batches, so what's in stock is what's real. When something sells out, it stays out until the next drop.",
    backgroundImage: "assets/gallery/photo_1_2026-10-31_00-46-32.jpg",
    highlights: [
      { title: "Small Batch", text: "Limited units per drop, restocked rarely" },
      { title: "DM to Cop", text: "Every order confirmed on WhatsApp — pick color & size first" },
      { title: "Nationwide", text: "Delivery arranged on order" },
    ],
  },
  gallery: {
    title: "The Attitude Lens",
    subtitle: "Shots from the studio, the road, and the after-hours crowd.",
    images: [
      "assets/gallery/photo_1_2026-10-31_00-46-32.jpg",
      "assets/gallery/photo_2_2026-10-31_00-46-32.jpg",
      "assets/gallery/photo_3_2026-10-31_00-46-32.jpg",
      "assets/gallery/photo_4_2026-10-31_00-46-32.jpg",
      "assets/gallery/photo_5_2026-10-31_00-46-32.jpg",
    ],
  },
  announcement: "", // e.g. "New drop this Saturday — message us to reserve". Leave blank to hide the banner.
  logo: "assets/logo.png",
  products: [
    {
      id: 1, name: "Crystal Trucker Cap", cat: "Headwear", price: 12000, stock: 9,
      img: "assets/products/1.jpg",
      frontImg: "assets/products/1.jpg",
      backImg: "assets/products/1.jpg",
      modelShots: ["assets/gallery/photo_1_2026-10-31_00-46-32.jpg", "assets/gallery/photo_2_2026-10-31_00-46-32.jpg"],
      description: "A clean, structured cap built for movement and late-night streets.",
      colors: [["Ferrari Red", "#c1121f"], ["White", "#f5f5f5"], ["Royal Blue", "#1d4ed8"]],
      sizes: ["One size"], dims: CAP_DIMS,
    },
    {
      id: 2, name: "YAMI Back-Print Tee", cat: "Tees", price: 16000, stock: 14,
      img: "assets/products/2.jpg",
      frontImg: "assets/products/2.jpg",
      backImg: "assets/products/2.jpg",
      modelShots: ["assets/gallery/photo_2_2026-10-31_00-46-32.jpg", "assets/gallery/photo_3_2026-10-31_00-46-32.jpg"],
      description: "A loud back-print tee with a sharp silhouette and all-day comfort.",
      colors: [["Pitch Black", "#0b0b0b"], ["Sky Blue", "#5aa9e6"], ["White", "#f5f5f5"]],
      sizes: ["S", "M", "L", "XL", "XXL"], dims: TOP_DIMS,
    },
    {
      id: 3, name: "Chess Club Shirt (Black)", cat: "Shirts", price: 26000, stock: 2,
      img: "assets/products/3.jpg",
      frontImg: "assets/products/3.jpg",
      backImg: "assets/products/3.jpg",
      modelShots: ["assets/gallery/photo_3_2026-10-31_00-46-32.jpg", "assets/gallery/photo_4_2026-10-31_00-46-32.jpg"],
      description: "A structured overshirt cut for layering over your everyday fit.",
      colors: [["Ink Black", "#111111"]],
      sizes: ["M", "L", "XL"], dims: TOP_DIMS,
    },
    {
      id: 4, name: "Attitude Graffiti Tank", cat: "Tanks", price: 13000, stock: 18,
      img: "assets/products/4.jpg",
      frontImg: "assets/products/4.jpg",
      backImg: "assets/products/4.jpg",
      modelShots: ["assets/gallery/photo_4_2026-10-31_00-46-32.jpg", "assets/gallery/photo_5_2026-10-31_00-46-32.jpg"],
      description: "Lightweight, oversized, and built for relaxed summer styling.",
      colors: [["Black", "#111111"], ["White", "#f5f5f5"]],
      sizes: ["S", "M", "L", "XL"], dims: TOP_DIMS,
    },
    {
      id: 5, name: "Chess Club Shirt (White)", cat: "Shirts", price: 26000, stock: 0,
      img: "assets/products/5.jpg",
      frontImg: "assets/products/5.jpg",
      backImg: "assets/products/5.jpg",
      modelShots: ["assets/gallery/photo_5_2026-10-31_00-46-32.jpg", "assets/gallery/photo_1_2026-10-31_00-46-32.jpg"],
      description: "The clean white take on the signature club shirt for standout layers.",
      colors: [["Optic White", "#f5f5f0"]],
      sizes: ["M", "L", "XL"], dims: TOP_DIMS,
    },
    {
      id: 6, name: "Born 2 Be Fly Tee", cat: "Tees", price: 19000, stock: 5,
      img: "assets/products/6.jpg",
      frontImg: "assets/products/6.jpg",
      backImg: "assets/products/6.jpg",
      modelShots: ["assets/gallery/photo_1_2026-10-31_00-46-32.jpg", "assets/gallery/photo_3_2026-10-31_00-46-32.jpg"],
      description: "Built for long days and louder fits with an easy, boxy silhouette.",
      colors: [["Noir", "#111111"], ["Arctic Blue", "#6f9bc4"]],
      sizes: ["S", "M", "L", "XL"], dims: TOP_DIMS,
    },
    {
      id: 7, name: "Swag Regime Flag Tee", cat: "Tees", price: 17000, stock: 11,
      img: "assets/products/7.jpg",
      frontImg: "assets/products/7.jpg",
      backImg: "assets/products/7.jpg",
      modelShots: ["assets/gallery/photo_2_2026-10-31_00-46-32.jpg", "assets/gallery/photo_4_2026-10-31_00-46-32.jpg"],
      description: "Graphic energy, easy fit, and enough attitude to speak before you do.",
      colors: [["Washed Black", "#1c1c1c"], ["Olive Camo", "#4b5a3a"], ["Bone", "#e8e2d0"]],
      sizes: ["M", "L", "XL", "XXL"], dims: TOP_DIMS,
    },
    {
      id: 8, name: "Attitude Styles Beanie", cat: "Headwear", price: 9000, stock: 3,
      img: "assets/products/8.jpg",
      frontImg: "assets/products/8.jpg",
      backImg: "assets/products/8.jpg",
      modelShots: ["assets/gallery/photo_5_2026-10-31_00-46-32.jpg", "assets/gallery/photo_2_2026-10-31_00-46-32.jpg"],
      description: "A warm, everyday staple that keeps the fit clean and the look locked in.",
      colors: [["Olive", "#556b2f"], ["Black", "#111111"]],
      sizes: ["One size"], dims: CAP_DIMS,
    },
  ],
};
