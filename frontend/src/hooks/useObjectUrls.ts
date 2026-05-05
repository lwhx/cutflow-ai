import { useEffect, useState } from 'react';
import type { UploadFileItem } from '../types/upload';

export function useObjectUrls(items: UploadFileItem[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const nextUrls = items.reduce<Record<string, string>>((urlMap, item) => {
      urlMap[item.fileKey] = URL.createObjectURL(item.file);
      return urlMap;
    }, {});
    setUrls(nextUrls);
    return () => {
      Object.values(nextUrls).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [items]);

  return urls;
}
