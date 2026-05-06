/**
 * POST /api/admin/bookings/[id]/add-product
 *
 * Canonical admin route for adding a product to a booking's invoice.
 * Delegates to the existing /products handler which is kept for backwards compat.
 */
export { POST } from '../products/route';
