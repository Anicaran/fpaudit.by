import type { Shop } from '../types';
import { shopDisplayName } from '../utils';

interface Props {
  shops: Shop[];
  onPick: (shop: Shop) => void;
  onClose: () => void;
}

export function ShopPickerDialog({ shops, onPick, onClose }: Props) {
  return (
    <dialog open className="shop-dialog" onClose={onClose}>
      <div className="dialog-inner">
        <h2>Выберите магазин</h2>
        <div className="list compact">
          {shops.map((s) => (
            <button
              key={s.id}
              type="button"
              className="item shop-pick"
              onClick={() => onPick(s)}
            >
              <strong>{shopDisplayName(s)}</strong>
              {s.address ? <div className="meta">{s.address}</div> : null}
            </button>
          ))}
        </div>
        <button type="button" className="btn block" onClick={onClose}>
          Отмена
        </button>
      </div>
    </dialog>
  );
}
