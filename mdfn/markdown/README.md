# @mdfn/markdown

The canonical CommonMark/GFM parser and serializer for mdfn. It records source
spans and raw slices, preserves unsupported constructs as opaque nodes, returns
byte-identical source when nothing changed, and patches only dirty top-level
regions when source spans remain valid.
