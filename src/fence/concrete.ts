import type { fenceLayout } from './layout';

/** Trace only the exposed edges of the concrete pieces that touch along the fence. */
export function concreteOutline({ posts, spans, length }: Pick<ReturnType<typeof fenceLayout>, 'posts' | 'spans' | 'length'>) {
  let path = '';
  let open = false;
  const append = (start: number, end: number, height: number) => {
    if (height > 0) {
      if (!open) path += `M${start} 0`;
      path += `V${-height}H${end}`;
      open = true;
    } else if (open) {
      path += 'V0Z';
      open = false;
    }
  };

  posts.forEach((post, index) => {
    const span = spans[index];
    const end = posts[index + 1]?.x ?? length;
    append(post.x, span?.x ?? end, post.type === 'concrete' ? post.height : 0);
    if (span) append(span.x, end, span.plinthHeight);
  });
  return open ? path + 'V0Z' : path;
}
