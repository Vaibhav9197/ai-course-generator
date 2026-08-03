/**
 * Gives every model a consistent JSON shape: `id` instead of `_id`, and no `__v`.
 * Applied globally so controllers never have to reshape documents by hand and the
 * frontend sees one convention everywhere.
 */
export function serializePlugin(schema) {
  schema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform(doc, ret) {
      ret.id = ret._id?.toString?.() ?? ret._id;
      delete ret._id;
      return ret;
    },
  });

  schema.set('toObject', { virtuals: true });
}

export default serializePlugin;
