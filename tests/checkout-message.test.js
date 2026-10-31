import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../js/checkout-message.js", import.meta.url), "utf8");
const window = {};
vm.runInNewContext(source, { window });

test("builds a WhatsApp order with item variants, totals, and delivery details", () => {
  const message = window.buildCheckoutMessage({
    lines: [{
      product: { name: "Everyday Tee", category: "Tees", price: "₦16,000" },
      color: "Blue",
      size: "L",
      dimension: "Chest 55 cm",
      quantity: 2,
      total: "₦32,000",
    }, {
      product: { name: "Beanie", category: "Headwear", price: "₦9,000" },
      color: "Black",
      size: "One size",
      dimension: "",
      quantity: 1,
      total: "₦9,000",
    }],
    total: "₦41,000",
    name: "Ada",
    phone: "+234 800 000 0000",
    address: "12 Example Road",
    city: "Lagos",
  });

  assert.match(message, /Everyday Tee/);
  assert.match(message, /Color: Blue/);
  assert.match(message, /Size: L \(Chest 55 cm\)/);
  assert.match(message, /Qty: 2 x ₦16,000 = ₦32,000/);
  assert.match(message, /2\. \*Beanie\*/);
  assert.match(message, /\*Total: ₦41,000\*/);
  assert.match(message, /Name: Ada/);
  assert.match(message, /Phone: \+234 800 000 0000/);
  assert.match(message, /Delivery address: 12 Example Road/);
  assert.match(message, /City\/State: Lagos/);
  assert.match(message, /not reserved until confirmed/);
});

test("omits blank delivery fields and keeps the availability reminder", () => {
  const message = window.buildCheckoutMessage({
    lines: [{
      product: { name: "Beanie", category: "Headwear", price: "₦9,000" },
      color: "Black",
      size: "One size",
      dimension: "",
      quantity: 1,
      total: "₦9,000",
    }],
    total: "₦9,000",
    name: "",
    phone: "",
    address: "",
    city: "",
  });

  assert.doesNotMatch(message, /Name:|Phone:|Delivery address:|City\/State:/);
  assert.match(message, /Please confirm current availability, delivery fee, and payment details/);
});
