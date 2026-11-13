import {allocateFromSource,roundHalfUp} from '@huoyoupu/money';

/** Net credit follows the original net source. Subtotal follows its cumulative
 * target while reserving every remaining net cent; discount is the difference.
 * Independently rounding net and discount can invent a subtotal penny. */
export function returnAmounts(source:{quantity:bigint;subtotal:bigint;net:bigint;returnedQuantity:bigint;returnedSubtotal:bigint;returnedNet:bigint},requested:bigint):{net:bigint;subtotal:bigint;discount:bigint}{
 const net=allocateFromSource({quantity:source.quantity,amount:source.net,allocatedQuantity:source.returnedQuantity,allocatedAmount:source.returnedNet},requested).amount;
 const remainingSubtotal=source.subtotal-source.returnedSubtotal;
 const remainingNet=source.net-source.returnedNet;
 if(source.net>source.subtotal||source.returnedSubtotal<source.returnedNet||remainingSubtotal<remainingNet)throw new RangeError('Inconsistent return subtotal source');
 const target=roundHalfUp(source.subtotal*(source.returnedQuantity+requested),source.quantity)-source.returnedSubtotal;
 const maximum=remainingSubtotal-(remainingNet-net);
 const subtotal=target<net?net:target>maximum?maximum:target;
 return{net,subtotal,discount:subtotal-net};
}
