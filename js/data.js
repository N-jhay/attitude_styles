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
  announcement: "", // e.g. "New drop this Saturday — message us to reserve". Leave blank to hide the banner.
  reel: "https://res.cloudinary.com/duw8lbca7/video/upload/v1785713601/steezywurld/vgcowhqwullba1vucwd3.mp4",
  logo: "assets/logo.png",
  products: [
    {
      id: 1, name: "Crystal Trucker Cap", cat: "Headwear", price: 12000, stock: 9,
      img: "assets/products/1.jpg",
      colors: [["Ferrari Red", "#c1121f"], ["White", "#f5f5f5"], ["Royal Blue", "#1d4ed8"]],
      sizes: ["One size"], dims: CAP_DIMS,
    },
    {
      id: 2, name: "YAMI Back-Print Tee", cat: "Tees", price: 16000, stock: 14,
      img: "assets/products/2.jpg",
      colors: [["Pitch Black", "#0b0b0b"], ["Sky Blue", "#5aa9e6"], ["White", "#f5f5f5"]],
      sizes: ["S", "M", "L", "XL", "XXL"], dims: TOP_DIMS,
    },
    {
      id: 3, name: "Chess Club Shirt (Black)", cat: "Shirts", price: 26000, stock: 2,
      img: "assets/products/3.jpg",
      colors: [["Ink Black", "#111111"]],
      sizes: ["M", "L", "XL"], dims: TOP_DIMS,
    },
    {
      id: 4, name: "Attitude Graffiti Tank", cat: "Tanks", price: 13000, stock: 18,
      img: "assets/products/4.jpg",
      colors: [["Black", "#111111"], ["White", "#f5f5f5"]],
      sizes: ["S", "M", "L", "XL"], dims: TOP_DIMS,
    },
    {
      id: 5, name: "Chess Club Shirt (White)", cat: "Shirts", price: 26000, stock: 0,
      img: "assets/products/5.jpg",
      colors: [["Optic White", "#f5f5f0"]],
      sizes: ["M", "L", "XL"], dims: TOP_DIMS,
    },
    {
      id: 6, name: "Born 2 Be Fly Tee", cat: "Tees", price: 19000, stock: 5,
      img: "assets/products/6.jpg",
      colors: [["Noir", "#111111"], ["Arctic Blue", "#6f9bc4"]],
      sizes: ["S", "M", "L", "XL"], dims: TOP_DIMS,
    },
    {
      id: 7, name: "Swag Regime Flag Tee", cat: "Tees", price: 17000, stock: 11,
      img: "assets/products/7.jpg",
      colors: [["Washed Black", "#1c1c1c"], ["Olive Camo", "#4b5a3a"], ["Bone", "#e8e2d0"]],
      sizes: ["M", "L", "XL", "XXL"], dims: TOP_DIMS,
    },
    {
      id: 8, name: "Attitude Styles Beanie", cat: "Headwear", price: 9000, stock: 3,
      img: "assets/products/8.jpg",
      colors: [["Olive", "#556b2f"], ["Black", "#111111"]],
      sizes: ["One size"], dims: CAP_DIMS,
    },
  ],
};
