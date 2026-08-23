# CrossLinkOS marketplace listing-field map — 22 August 2026

## Research boundary

This map separates platform inputs documented publicly as standard listing or bulk-listing attributes from inputs that are selected only after a seller chooses a particular category, shipping option, or country. CrossLinkOS can collect every shared and documented seller input in its canonical record, but no single static form can truthfully enumerate all category-specific dropdown values on platforms whose taxonomies change. The canonical form therefore needs a structured **category attributes** section plus a platform-specific review checklist rather than inventing a fixed value list.

| Data group | Poshmark | Depop | Mercari | Canonical CrossLinkOS capture |
| --- | --- | --- | --- | --- |
| Photos | Up to 16; a covershot plus up to 15 alternatives in the bulk template | Public guidance varies by flow; use multiple original photos and show flaws | Up to 12; cover ordering matters | Up to 16 photo records, cover selection, original/processed variants, photo notes |
| Core copy | Title (80 characters), description (1,500 characters) | Description, relevant tags/hashtags, clear title terms | Description, relevant tags; title is platform form-dependent | Title, short marketplace title, long description, item facts, tag list, optional platform title overrides |
| Taxonomy | Department, category, subcategory | Category and subcategory | Category; category-dependent attributes | Department/gender, category, subcategory, and a flexible category-attributes map |
| Product identity | SKU, ProductID/UPC/GTIN, brand | Brand | Brand | SKU, UPC/GTIN, brand, model/style code, authenticity/serial, release or manufacture details |
| Product properties | Size, quantity, condition, two colors, three style tags | Size, color up to two, style, quantity, condition | Condition, color, size, category-dependent fields | Size plus size system, quantity, condition, two colors, style tags, material, pattern, fit, measurements, flaws, included items, custom attributes |
| Pricing | Original price, list price, optional Smart Sell minimum or floor percentage | Item price, optional boost choice | List price; optional Smart Pricing floor | Original/MSRP, one list price, optional Posh floor/minimum, optional Mercari floor, optional Depop boost choice |
| Shipping | Optional shipping discount; standard label otherwise | Shipping price/method; US discount/freight choices and international options depend on locale | Buyer/seller pays, prepaid versus self-ship, item/package weight, and dimensional package sizing where requested | Per-platform shipping method, payer, service, price/discount, item/package weight, package length/width/height, origin postal code, international option, handling note |
| Lifecycle | Availability: for sale, not for sale, drops, or draft; drop time when applicable | Draft versus posted | Draft versus listed | Canonical lifecycle + per-platform desired availability / draft intent / scheduled drop time |

## Poshmark fields

Poshmark’s public web guidance identifies **title, description, category, size, original price, and listing price** as required and permits up to 16 photos. Its bulk template additionally documents SKU, ProductID (UPC/GTIN), department, subcategory, quantity, condition, brand, one or two colors, variant data, three style tags, shipping discount, Smart Sell floor/minimum settings, availability, drop time, private other info, and cover/alternative images. [1] [2]

## Depop fields

Depop’s current public guides identify photos, description, relevant hashtags, category, shipping price, item price, brand, color (up to two), style, and quantity. It emphasizes category/subcategory, exact measurements and fit notes, condition and flaws, original images, shipping/bundle information, shipping-discount options for US Depop Shipping, and a draft state that can later be posted. [3] [4] [5] [6]

## Mercari fields

Mercari’s current public help identifies photos, description, brand, category, condition, tags, price, and shipping configuration. At listing time the seller supplies item weight, selects a carrier option, may supply package dimensions for dimensional-weight determination, chooses buyer-paid versus seller-paid shipping, and can choose a prepaid label or self-ship. Item details may be category-dependent, so those must be carried by the flexible custom-attributes section and verified in the marketplace form. [7] [8] [9]

## Implementation rule

CrossLinkOS must mark a platform draft **Ready to hand off** only when its known mandatory core fields are present. It must separately show **category-dependent confirmation** for values that can be selected only in the live marketplace form. A local extension fill means **prefilled for review**, never a marketplace draft saved or published.

## References

[1]: https://support.poshmark.com/s/article/894455911?language=en_US "Poshmark — How to list"
[2]: https://support.poshmark.com/s/article/Bulk-Upload-Templates "Poshmark — How to use Bulk Upload Templates"
[3]: https://depophelp.zendesk.com/hc/en-gb/articles/360032716413-How-to-list-an-item "Depop — How to list an item"
[4]: https://depophelp.zendesk.com/hc/en-gb/articles/360020435158-Tips-for-describing-your-item "Depop — Tips for describing your item"
[5]: https://depophelp.zendesk.com/hc/en-gb/articles/8608273715217-Listing-on-web "Depop — Listing on web"
[6]: https://depophelp.zendesk.com/hc/en-gb/articles/16523051318033-How-to-ship-US "Depop — How to ship US"
[7]: https://www.mercari.com/us/help_center/topics/listing/guides/creating-a-listing/ "Mercari — Creating a Listing"
[8]: https://www.mercari.com/us/help_center/topics/account/guides/how-it-works/ "Mercari — How It Works"
[9]: https://www.mercari.com/us/help_center/topics/account/policies/seller-protection/ "Mercari — Seller Protection"
