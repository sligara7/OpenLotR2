/*
 * Where each historic county sits, in real degrees.
 *
 * One approximate centre per county — roughly the middle of its historic
 * territory, not its county town. These replace the old hand-drawn col/row
 * layout grid as the thing that decides county PLACEMENT: the tile builder
 * projects them into the hex grid alongside the coastline, so a county lands
 * where it really is rather than where a spreadsheet cell put it.
 *
 * Positions are real-world geography (fact), stated to 2 decimal places — about
 * a kilometre, well inside one hex at any resolution this game draws. They are
 * eyeballed centroids, not survey data: good enough to place a county, and
 * deliberately not precise enough to pretend otherwise.
 *
 * The county's SHAPE is not here. Shape comes from the coastline plus
 * nearest-centre assignment in `britain-tiles.ts` — these points only say where
 * the seed goes.
 */

/** [longitude, latitude] of a county's approximate centre. */
export type Coord = readonly [number, number];

export const COUNTY_COORDS: Readonly<Record<string, Coord>> = {
  // ---- Scotland (north → south) ----------------------------------------
  'caithness': [-3.45, 58.45],
  'sutherland': [-4.60, 58.20],
  'ross-cromarty': [-4.75, 57.65],
  'inverness-shire': [-4.60, 57.15],
  'nairnshire': [-3.90, 57.55],
  'moray': [-3.30, 57.50],
  'banffshire': [-2.95, 57.45],
  'aberdeenshire': [-2.50, 57.30],
  'kincardineshire': [-2.40, 56.95],
  'argyll': [-5.30, 56.35],
  'perthshire': [-3.90, 56.55],
  'angus': [-2.90, 56.70],
  'fife': [-3.10, 56.25],
  'kinross-shire': [-3.45, 56.20],
  'clackmannanshire': [-3.75, 56.13],
  'stirlingshire': [-4.05, 56.05],
  'dunbartonshire': [-4.50, 56.00],
  'renfrewshire': [-4.55, 55.83],
  'west-lothian': [-3.55, 55.90],
  'midlothian': [-3.15, 55.85],
  'east-lothian': [-2.75, 55.95],
  'lanarkshire': [-3.85, 55.70],
  'ayrshire': [-4.55, 55.45],
  'peeblesshire': [-3.25, 55.62],
  'selkirkshire': [-2.95, 55.53],
  'berwickshire': [-2.45, 55.75],
  'roxburghshire': [-2.65, 55.40],
  'wigtownshire': [-4.65, 54.90],
  'kirkcudbrightshire': [-4.05, 54.95],
  'dumfriesshire': [-3.55, 55.20],

  // ---- England (north → south) -----------------------------------------
  'northumberland': [-2.00, 55.25],
  'cumberland': [-3.05, 54.70],
  'durham': [-1.75, 54.70],
  'westmorland': [-2.65, 54.45],
  'lancashire': [-2.70, 53.80],
  'yorkshire': [-1.30, 54.00],
  'cheshire': [-2.55, 53.20],
  'derbyshire': [-1.60, 53.10],
  'nottinghamshire': [-1.00, 53.10],
  'lincolnshire': [-0.35, 53.10],
  'shropshire': [-2.70, 52.65],
  'staffordshire': [-2.00, 52.85],
  'leicestershire': [-1.10, 52.65],
  'rutland': [-0.65, 52.65],
  'warwickshire': [-1.60, 52.30],
  'worcestershire': [-2.20, 52.20],
  'herefordshire': [-2.75, 52.10],
  'northamptonshire': [-0.85, 52.30],
  'cambridgeshire': [0.10, 52.35],
  'huntingdonshire': [-0.20, 52.35],
  'norfolk': [0.95, 52.65],
  'suffolk': [1.00, 52.20],
  'gloucestershire': [-2.20, 51.85],
  'oxfordshire': [-1.25, 51.80],
  'buckinghamshire': [-0.80, 51.80],
  'bedfordshire': [-0.45, 52.05],
  'hertfordshire': [-0.20, 51.85],
  'essex': [0.60, 51.75],
  'middlesex': [-0.30, 51.52],
  'berkshire': [-1.10, 51.45],
  'wiltshire': [-1.90, 51.30],
  'somerset': [-2.90, 51.10],
  'surrey': [-0.45, 51.25],
  'kent': [0.75, 51.20],
  'hampshire': [-1.30, 51.05],
  'sussex': [-0.40, 50.95],
  'dorset': [-2.30, 50.80],
  'devon': [-3.75, 50.75],
  'cornwall': [-4.75, 50.45],

  // ---- Wales (north → south) -------------------------------------------
  'anglesey': [-4.35, 53.28],
  'caernarfonshire': [-4.15, 53.05],
  'denbighshire': [-3.40, 53.10],
  'flintshire': [-3.15, 53.20],
  'merionethshire': [-3.85, 52.80],
  'montgomeryshire': [-3.35, 52.55],
  'cardiganshire': [-4.05, 52.25],
  'radnorshire': [-3.25, 52.25],
  'pembrokeshire': [-4.85, 51.85],
  'carmarthenshire': [-4.20, 51.90],
  'breconshire': [-3.45, 51.95],
  'glamorgan': [-3.50, 51.55],
  'monmouthshire': [-2.95, 51.70],
};
