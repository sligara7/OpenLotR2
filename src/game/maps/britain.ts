/*
 * Great Britain — original map of historic counties (England, Wales, Scotland).
 *
 * Region names and their borders are real-world geography (facts); the layout
 * grid (col/row) and the tiling are our own. Adjacency is declared once per
 * region and symmetrised by mapEdges(); a test asserts every neighbour id
 * exists and the whole graph is connected.
 *
 * col: west(0) → east(~12).  row: north(0) → south(~23).
 */

import type { GameMap, MapRegion } from './types.ts';

function r(
  id: string,
  name: string,
  country: MapRegion['country'],
  col: number,
  row: number,
  neighbours: string[],
): MapRegion {
  return { id, name, country, col, row, neighbours };
}

const regions: MapRegion[] = [
  // ---- Scotland (north → south) ----------------------------------------
  r('caithness', 'Caithness', 'Scotland', 7, 0, ['sutherland']),
  r('sutherland', 'Sutherland', 'Scotland', 5, 1, ['caithness', 'ross-cromarty']),
  r('ross-cromarty', 'Ross & Cromarty', 'Scotland', 5, 2, ['sutherland', 'inverness-shire']),
  r('inverness-shire', 'Inverness-shire', 'Scotland', 5, 3, ['ross-cromarty', 'nairnshire', 'moray', 'banffshire', 'aberdeenshire', 'perthshire', 'argyll']),
  r('nairnshire', 'Nairnshire', 'Scotland', 6, 3, ['inverness-shire', 'moray']),
  r('moray', 'Moray', 'Scotland', 7, 3, ['nairnshire', 'inverness-shire', 'banffshire']),
  r('banffshire', 'Banffshire', 'Scotland', 8, 3, ['moray', 'inverness-shire', 'aberdeenshire']),
  r('aberdeenshire', 'Aberdeenshire', 'Scotland', 9, 4, ['banffshire', 'inverness-shire', 'perthshire', 'angus', 'kincardineshire']),
  r('kincardineshire', 'Kincardineshire', 'Scotland', 9, 5, ['aberdeenshire', 'angus']),
  r('argyll', 'Argyll', 'Scotland', 3, 5, ['inverness-shire', 'perthshire', 'dunbartonshire']),
  r('perthshire', 'Perthshire', 'Scotland', 6, 5, ['inverness-shire', 'argyll', 'aberdeenshire', 'angus', 'fife', 'kinross-shire', 'clackmannanshire', 'stirlingshire', 'dunbartonshire']),
  r('angus', 'Angus', 'Scotland', 8, 5, ['aberdeenshire', 'kincardineshire', 'perthshire', 'fife']),
  r('fife', 'Fife', 'Scotland', 8, 6, ['angus', 'perthshire', 'kinross-shire', 'clackmannanshire']),
  r('kinross-shire', 'Kinross-shire', 'Scotland', 7, 6, ['fife', 'perthshire']),
  r('clackmannanshire', 'Clackmannanshire', 'Scotland', 7, 6, ['fife', 'perthshire', 'stirlingshire']),
  r('stirlingshire', 'Stirlingshire', 'Scotland', 6, 7, ['perthshire', 'clackmannanshire', 'dunbartonshire', 'lanarkshire', 'west-lothian']),
  r('dunbartonshire', 'Dunbartonshire', 'Scotland', 5, 7, ['argyll', 'perthshire', 'stirlingshire', 'lanarkshire', 'renfrewshire']),
  r('renfrewshire', 'Renfrewshire', 'Scotland', 4, 8, ['dunbartonshire', 'lanarkshire', 'ayrshire']),
  r('west-lothian', 'West Lothian', 'Scotland', 7, 7, ['stirlingshire', 'lanarkshire', 'midlothian']),
  r('midlothian', 'Midlothian', 'Scotland', 8, 7, ['west-lothian', 'lanarkshire', 'peeblesshire', 'selkirkshire', 'east-lothian', 'berwickshire']),
  r('east-lothian', 'East Lothian', 'Scotland', 9, 7, ['midlothian', 'berwickshire']),
  r('lanarkshire', 'Lanarkshire', 'Scotland', 6, 8, ['stirlingshire', 'dunbartonshire', 'renfrewshire', 'ayrshire', 'dumfriesshire', 'peeblesshire', 'west-lothian', 'midlothian']),
  r('ayrshire', 'Ayrshire', 'Scotland', 4, 9, ['renfrewshire', 'lanarkshire', 'dumfriesshire', 'kirkcudbrightshire', 'wigtownshire']),
  r('peeblesshire', 'Peeblesshire', 'Scotland', 7, 9, ['lanarkshire', 'midlothian', 'selkirkshire', 'dumfriesshire']),
  r('selkirkshire', 'Selkirkshire', 'Scotland', 8, 9, ['peeblesshire', 'midlothian', 'roxburghshire', 'dumfriesshire']),
  r('berwickshire', 'Berwickshire', 'Scotland', 9, 8, ['east-lothian', 'midlothian', 'roxburghshire', 'northumberland']),
  r('roxburghshire', 'Roxburghshire', 'Scotland', 8, 10, ['selkirkshire', 'berwickshire', 'dumfriesshire', 'northumberland', 'cumberland']),
  r('wigtownshire', 'Wigtownshire', 'Scotland', 3, 10, ['ayrshire', 'kirkcudbrightshire']),
  r('kirkcudbrightshire', 'Kirkcudbrightshire', 'Scotland', 4, 10, ['wigtownshire', 'ayrshire', 'dumfriesshire']),
  r('dumfriesshire', 'Dumfriesshire', 'Scotland', 6, 10, ['kirkcudbrightshire', 'ayrshire', 'lanarkshire', 'peeblesshire', 'selkirkshire', 'roxburghshire', 'cumberland']),

  // ---- England (north → south) -----------------------------------------
  r('northumberland', 'Northumberland', 'England', 8, 11, ['berwickshire', 'roxburghshire', 'cumberland', 'durham']),
  r('cumberland', 'Cumberland', 'England', 6, 11, ['dumfriesshire', 'roxburghshire', 'northumberland', 'durham', 'westmorland', 'lancashire']),
  r('durham', 'Durham', 'England', 8, 12, ['northumberland', 'cumberland', 'westmorland', 'yorkshire']),
  r('westmorland', 'Westmorland', 'England', 7, 12, ['cumberland', 'durham', 'yorkshire', 'lancashire']),
  r('lancashire', 'Lancashire', 'England', 6, 13, ['cumberland', 'westmorland', 'yorkshire', 'cheshire']),
  r('yorkshire', 'Yorkshire', 'England', 8, 13, ['durham', 'westmorland', 'lancashire', 'cheshire', 'derbyshire', 'nottinghamshire', 'lincolnshire']),
  r('cheshire', 'Cheshire', 'England', 6, 14, ['lancashire', 'yorkshire', 'derbyshire', 'staffordshire', 'shropshire', 'flintshire', 'denbighshire']),
  r('derbyshire', 'Derbyshire', 'England', 7, 14, ['yorkshire', 'cheshire', 'staffordshire', 'leicestershire', 'nottinghamshire']),
  r('nottinghamshire', 'Nottinghamshire', 'England', 8, 14, ['yorkshire', 'derbyshire', 'leicestershire', 'lincolnshire']),
  r('lincolnshire', 'Lincolnshire', 'England', 9, 14, ['yorkshire', 'nottinghamshire', 'leicestershire', 'rutland', 'northamptonshire', 'cambridgeshire']),
  r('shropshire', 'Shropshire', 'England', 5, 15, ['cheshire', 'staffordshire', 'worcestershire', 'herefordshire', 'radnorshire', 'montgomeryshire', 'denbighshire']),
  r('staffordshire', 'Staffordshire', 'England', 6, 15, ['cheshire', 'derbyshire', 'leicestershire', 'warwickshire', 'worcestershire', 'shropshire']),
  r('leicestershire', 'Leicestershire', 'England', 8, 15, ['derbyshire', 'nottinghamshire', 'lincolnshire', 'rutland', 'northamptonshire', 'warwickshire', 'staffordshire']),
  r('rutland', 'Rutland', 'England', 9, 15, ['leicestershire', 'lincolnshire', 'northamptonshire']),
  r('warwickshire', 'Warwickshire', 'England', 7, 16, ['staffordshire', 'leicestershire', 'northamptonshire', 'oxfordshire', 'gloucestershire', 'worcestershire']),
  r('worcestershire', 'Worcestershire', 'England', 6, 16, ['staffordshire', 'warwickshire', 'gloucestershire', 'herefordshire', 'shropshire']),
  r('herefordshire', 'Herefordshire', 'England', 5, 16, ['shropshire', 'worcestershire', 'gloucestershire', 'monmouthshire', 'breconshire', 'radnorshire']),
  r('northamptonshire', 'Northamptonshire', 'England', 8, 16, ['lincolnshire', 'rutland', 'leicestershire', 'warwickshire', 'oxfordshire', 'buckinghamshire', 'bedfordshire', 'huntingdonshire', 'cambridgeshire']),
  r('cambridgeshire', 'Cambridgeshire', 'England', 10, 16, ['lincolnshire', 'northamptonshire', 'huntingdonshire', 'bedfordshire', 'hertfordshire', 'essex', 'suffolk', 'norfolk']),
  r('huntingdonshire', 'Huntingdonshire', 'England', 9, 16, ['northamptonshire', 'cambridgeshire', 'bedfordshire']),
  r('norfolk', 'Norfolk', 'England', 11, 16, ['lincolnshire', 'cambridgeshire', 'suffolk']),
  r('suffolk', 'Suffolk', 'England', 11, 17, ['norfolk', 'cambridgeshire', 'essex']),
  r('gloucestershire', 'Gloucestershire', 'England', 6, 17, ['worcestershire', 'warwickshire', 'oxfordshire', 'wiltshire', 'somerset', 'herefordshire', 'monmouthshire', 'berkshire']),
  r('oxfordshire', 'Oxfordshire', 'England', 7, 17, ['warwickshire', 'northamptonshire', 'buckinghamshire', 'berkshire', 'gloucestershire']),
  r('buckinghamshire', 'Buckinghamshire', 'England', 8, 17, ['northamptonshire', 'oxfordshire', 'berkshire', 'hertfordshire', 'bedfordshire', 'middlesex']),
  r('bedfordshire', 'Bedfordshire', 'England', 9, 17, ['northamptonshire', 'huntingdonshire', 'cambridgeshire', 'hertfordshire', 'buckinghamshire']),
  r('hertfordshire', 'Hertfordshire', 'England', 9, 18, ['bedfordshire', 'cambridgeshire', 'essex', 'middlesex', 'buckinghamshire']),
  r('essex', 'Essex', 'England', 10, 18, ['cambridgeshire', 'suffolk', 'hertfordshire', 'middlesex', 'kent']),
  r('middlesex', 'Middlesex', 'England', 9, 18, ['hertfordshire', 'buckinghamshire', 'essex', 'surrey', 'kent']),
  r('berkshire', 'Berkshire', 'England', 7, 18, ['gloucestershire', 'oxfordshire', 'buckinghamshire', 'wiltshire', 'hampshire', 'surrey']),
  r('wiltshire', 'Wiltshire', 'England', 6, 18, ['gloucestershire', 'berkshire', 'hampshire', 'dorset', 'somerset']),
  r('somerset', 'Somerset', 'England', 5, 18, ['gloucestershire', 'wiltshire', 'dorset', 'devon']),
  r('surrey', 'Surrey', 'England', 9, 19, ['middlesex', 'berkshire', 'hampshire', 'sussex', 'kent']),
  r('kent', 'Kent', 'England', 10, 19, ['essex', 'middlesex', 'surrey', 'sussex']),
  r('hampshire', 'Hampshire', 'England', 8, 19, ['berkshire', 'wiltshire', 'dorset', 'surrey', 'sussex']),
  r('sussex', 'Sussex', 'England', 9, 20, ['hampshire', 'surrey', 'kent']),
  r('dorset', 'Dorset', 'England', 6, 20, ['somerset', 'wiltshire', 'hampshire', 'devon']),
  r('devon', 'Devon', 'England', 4, 20, ['somerset', 'dorset', 'cornwall']),
  r('cornwall', 'Cornwall', 'England', 2, 21, ['devon']),

  // ---- Wales (north → south) -------------------------------------------
  r('anglesey', 'Anglesey', 'Wales', 3, 13, ['caernarfonshire']),
  r('caernarfonshire', 'Caernarfonshire', 'Wales', 3, 14, ['anglesey', 'denbighshire', 'merionethshire']),
  r('denbighshire', 'Denbighshire', 'Wales', 4, 14, ['caernarfonshire', 'flintshire', 'merionethshire', 'montgomeryshire', 'cheshire', 'shropshire']),
  r('flintshire', 'Flintshire', 'Wales', 5, 13, ['denbighshire', 'cheshire']),
  r('merionethshire', 'Merionethshire', 'Wales', 3, 15, ['caernarfonshire', 'denbighshire', 'montgomeryshire', 'cardiganshire']),
  r('montgomeryshire', 'Montgomeryshire', 'Wales', 4, 15, ['denbighshire', 'merionethshire', 'cardiganshire', 'radnorshire', 'shropshire']),
  r('cardiganshire', 'Cardiganshire', 'Wales', 3, 16, ['merionethshire', 'montgomeryshire', 'radnorshire', 'breconshire', 'carmarthenshire', 'pembrokeshire']),
  r('radnorshire', 'Radnorshire', 'Wales', 4, 16, ['montgomeryshire', 'cardiganshire', 'breconshire', 'herefordshire', 'shropshire']),
  r('pembrokeshire', 'Pembrokeshire', 'Wales', 2, 17, ['cardiganshire', 'carmarthenshire']),
  r('carmarthenshire', 'Carmarthenshire', 'Wales', 3, 17, ['cardiganshire', 'pembrokeshire', 'breconshire', 'glamorgan']),
  r('breconshire', 'Breconshire', 'Wales', 4, 17, ['cardiganshire', 'radnorshire', 'carmarthenshire', 'glamorgan', 'monmouthshire', 'herefordshire']),
  r('glamorgan', 'Glamorgan', 'Wales', 4, 18, ['carmarthenshire', 'breconshire', 'monmouthshire']),
  r('monmouthshire', 'Monmouthshire', 'Wales', 5, 17, ['glamorgan', 'breconshire', 'herefordshire', 'gloucestershire']),
];

export const BRITAIN: GameMap = {
  id: 'britain',
  name: 'Great Britain',
  regions,
};
