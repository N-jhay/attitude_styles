"use strict";

(function (root) {
  root.buildCheckoutMessage = function ({ lines, total, name, phone, address, city }) {
    const items = lines.map((line, index) => {
      const { product, color, size, quantity, dimension } = line;
      return `${index + 1}. *${product.name}*\n   Type: ${product.category}\n   Color: ${color}\n   Size: ${size}${dimension ? ` (${dimension})` : ""}\n   Qty: ${quantity} x ${product.price} = ${line.total}`;
    }).join("\n\n");
    const delivery = [
      name && `Name: ${name}`,
      phone && `Phone: ${phone}`,
      address && `Delivery address: ${address}`,
      city && `City/State: ${city}`,
    ].filter(Boolean);

    return `Hello Attitude Styles! I'd like to order:\n\n${items}\n\n*Total: ${total}*${delivery.length ? `\n\n${delivery.join("\n")}` : ""}\n\nPlease confirm current availability, delivery fee, and payment details. This order is not reserved until confirmed.`;
  };
})(window);
