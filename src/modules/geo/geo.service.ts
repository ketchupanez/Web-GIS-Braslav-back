import { prisma } from '../../shared/database';

export class GeoService {
  async getLakes() {
    const lakes = await prisma.lake.findMany();
    return {
      type: 'FeatureCollection',
      features: lakes.map(lake => ({
        type: 'Feature',
        properties: {
          id: lake.id,
          name: lake.name,
          area_ha: lake.areaHa,
          center: lake.center,
        },
        geometry: lake.geometry,
      })),
    };
  }

  async getSprings() {
    const springs = await prisma.spring.findMany();
    return {
      type: 'FeatureCollection',
      features: springs.map(spring => ({
        type: 'Feature',
        properties: {
          id: spring.id,
          name: spring.name,
          coordinates: spring.coordinates,
        },
        geometry: spring.geometry,
      })),
    };
  }

  async getRivers() {
    const segments = await prisma.riverSegment.findMany({
      include: { river: true },
    });
    
    return {
      type: 'FeatureCollection',
      features: segments.map((seg) => ({
        type: 'Feature',
        properties: {
          id: seg.id,
          name: seg.river.name,
          river_id: seg.riverId,
        },
        geometry: seg.geometry,
      })),
    };
  }

  async getRiversList() {
    const rivers = await prisma.river.findMany({
      orderBy: { name: 'asc' },
    });
  
    return {
      type: 'FeatureCollection',
      features: rivers.map((river) => ({
        type: 'Feature',
        properties: {
          id: river.id,
          name: river.name,
        },
        geometry: null,
      })),
    };
  }

  async getAccommodation() {
    const items = await prisma.accommodation.findMany();
    return {
      type: 'FeatureCollection',
      features: items.map(item => ({
        type: 'Feature',
        properties: {
          id: item.id,
          name: item.name,
          type: item.type?.toLowerCase() || null,
          address: item.address,
          coordinates: item.coordinates,
        },
        geometry: item.geometry,
      })),
    };
  }

  async getTouristStops() {
    const items = await prisma.touristStop.findMany();
    return {
      type: 'FeatureCollection',
      features: items.map(item => ({
        type: 'Feature',
        properties: {
          id: item.id,
          name: item.name,
          coordinates: item.coordinates,
        },
        geometry: item.geometry,
      })),
    };
  }

  async getTourismOrganizers() {
    const items = await prisma.tourismOrganizer.findMany();
    return {
      type: 'FeatureCollection',
      features: items.map(item => ({
        type: 'Feature',
        properties: {
          id: item.id,
          name: item.name,
          type: item.type?.toLowerCase() || null, 
          address: item.address,
          coordinates: item.coordinates,
        },
        geometry: item.geometry,
      })),
    };
  }
}