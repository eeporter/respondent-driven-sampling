import mongoose, { InferSchemaType, Model, Schema } from 'mongoose';

import { HubType, LocationType } from '@/database/utils/constants';

const locationSchema = new Schema(
	{
		hubName: { type: String, required: true, unique: true },
		hubType: { type: String, enum: HubType, required: true },
		locationType: { type: String, enum: LocationType, required: true },
		address: { type: String, required: true, unique: true },
		// A retired hub site keeps its record (surveys, seeds and users stay linked)
		// but is no longer offered when choosing a site.
		retired: { type: Boolean, default: false }
	},
	{ strict: 'throw' }
);

export type ILocation = InferSchemaType<typeof locationSchema>;
const Location: Model<ILocation> = mongoose.model<ILocation>(
	'Location',
	locationSchema
);
export default Location;
